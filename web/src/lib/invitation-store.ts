import type {PoolClient} from "pg";
import {randomUUID} from "node:crypto";
import {database,StoreError} from "./store";
import {assertWorld,restoreWorld} from "./world";
import {activeAppointment,assessInvitation,appointmentReply,meetingTravelMinutes,invitationTime,type Appointment} from "./appointments";
import {playerMemory,rememberPlayer} from "./player-memory";
import {HISTORY_TURNS,type ChatTurn} from "./chat-types";
import {recallRequest,retrievePlayerFacts,type InvitationSource} from "./chat-facts";
import {canStand,SCENES} from "./scene-data";
import {atMeetingPlace,meetingPlace,meetingName} from './meeting-places';
import {nearbyResidents} from "./interaction";
import type {Player} from "./player-scene";
import {absoluteMeetingTime,type MeetingIntent} from './meeting-language';
import {compileGoalPlan,GOAL_RECIPES,waitsForPlayer} from './goal-plan';

export async function privateAppointments(worldId:string,npcId:string,visitorId:string):Promise<Appointment[]>{
 const client=await database().connect();
 try{return (await privateConversationState(client,worldId,npcId,visitorId)).appointments;}finally{client.release();}
}
// A single statement gives world + private commitments the same PostgreSQL snapshot.
// No transaction or world lock remains open while the external model is awaited.
export async function privateConversationState(client:PoolClient,id:string,npcId:string,visitorId:string,message=""){
 const query=recallRequest(message);
 const result=await client.query(`SELECT w.payload,
   COALESCE((SELECT json_agg(recent.payload) FROM (
     SELECT payload FROM town_invitations WHERE world_id=w.id AND npc_id=$2 AND visitor_id=$3
     ORDER BY CASE WHEN payload->>'status' IN ('accepted','waiting','travelling','executing') THEN 0
       WHEN payload->>'status'='arrived' AND (payload->>'waitUntilMinute')::int>(w.payload->>'minute')::int THEN 0
       WHEN payload->>'status'='proposed' THEN 1 ELSE 2 END,updated_at DESC,id DESC LIMIT 8
   ) recent),'[]'::json) AS appointments,
   COALESCE((SELECT json_agg(json_build_object('appointment',important.payload,'confirmation',important.response)) FROM (
     SELECT payload,response FROM town_invitations WHERE world_id=w.id AND npc_id=$2 AND visitor_id=$3
     AND ($4::int IS NULL AND $5::int IS NULL OR EXISTS (
       SELECT 1 FROM (VALUES ((payload->>'createdMinute')::int),((payload->>'arrivedMinute')::int),((payload->>'confirmedMinute')::int),((payload->>'metMinute')::int),((payload->>'updatedMinute')::int)) AS event_time(minute)
       WHERE floor(event_time.minute/1440.0)+1=COALESCE($4::int,floor((w.payload->>'minute')::numeric/1440)+1+$5::int)
     ))
     ORDER BY CASE payload->>'status' WHEN 'completed' THEN 0 WHEN 'met' THEN 0 WHEN 'arrived' THEN 1 WHEN 'missed' THEN 1 WHEN 'cancelled' THEN 1 WHEN 'failed' THEN 1
       WHEN 'accepted' THEN 2 WHEN 'waiting' THEN 2 WHEN 'travelling' THEN 2 ELSE 3 END,
       (payload->>'updatedMinute')::int DESC,id DESC LIMIT 6
   ) important),'[]'::json) AS sources
   FROM town_worlds w WHERE w.id=$1`,[id,npcId,visitorId,query.day,query.relative]);
 if(!result.rows.length)throw new StoreError(404,"世界不存在");
 const world=restoreWorld(result.rows[0].payload);
 return {world,appointments:result.rows[0].appointments as Appointment[],recall:retrievePlayerFacts(result.rows[0].sources as InvitationSource[],message,world.minute,world.npcs.find(n=>n.id===npcId)?.name)};
}
// Called with the existing NPC reply lock. This short transaction contains NO model I/O.
export async function confirmInvitation(client:PoolClient,id:string,npcId:string,visitorId:string,message:string,requestId:string,mode:"invite"|"propose"|"negotiate"|"schedule"|"confirm"|"cancel"="invite",language?:{intent:MeetingIntent;expected?:Appointment}):Promise<ChatTurn>{
 await client.query("BEGIN");
 try{
  const prior=await client.query("SELECT response FROM town_invitations WHERE world_id=$1 AND npc_id=$2 AND visitor_id=$3 AND (request_id=$4::uuid OR response->'confirmation'->>'requestId'=$4::text OR response->'receipts' @> $5::jsonb)",[id,npcId,visitorId,requestId,JSON.stringify([{requestId}])]);
  if(prior.rows.length){const r=prior.rows[0].response;const turn=r.receipts?.find((x:{requestId:string})=>x.requestId===requestId)?.turn??(r.confirmation?.requestId===requestId?r.confirmation.turn:r);if(turn.message!==message)throw new StoreError(409,"同一请求编号不能用于另一条消息。");await client.query("COMMIT");return turn;}
  const row=(await client.query("SELECT payload FROM town_worlds WHERE id=$1 FOR UPDATE",[id])).rows[0];
  if(!row)throw new StoreError(404,"世界不存在");
  const w=restoreWorld(row.payload),n=w.npcs.find(n=>n.id===npcId);if(!n)throw new StoreError(404,"居民不存在");
  const old=(await client.query("SELECT turns,player_memory FROM town_private_chats WHERE world_id=$1 AND npc_id=$2 AND visitor_id=$3",[id,npcId,visitorId])).rows[0];
  const history:ChatTurn[]=old?.turns??[],memory=playerMemory(old?.player_memory,history);
  const pending=(await client.query("SELECT id,payload,response FROM town_invitations WHERE world_id=$1 AND npc_id=$2 AND visitor_id=$3 AND payload->>'status'='proposed' ORDER BY updated_at DESC LIMIT 1",[id,npcId,visitorId])).rows[0];
  const own=n.appointment&&(await client.query("SELECT id,payload,response FROM town_invitations WHERE world_id=$1 AND npc_id=$2 AND visitor_id=$3 AND id=$4",[id,npcId,visitorId,n.appointment.id])).rows[0];
  if(language?.expected){
   const ref=(await client.query("SELECT payload FROM town_invitations WHERE world_id=$1 AND npc_id=$2 AND visitor_id=$3 AND id=$4",[id,npcId,visitorId,language.expected.id])).rows[0]?.payload as Appointment|undefined;
   const signature=(v:Appointment|undefined)=>v&&JSON.stringify([v.id,v.status,v.updatedMinute,v.scheduledMinute,v.target,v.requestedTime]);
   if(signature(ref)!==signature(language.expected))throw new StoreError(409,"约定在理解期间已变化，请重新确认当前安排。");
   if(pending?.id!==ref?.id&&own?.id!==ref?.id)throw new StoreError(409,'这条约定已结束，请重新提出会面。');
  }
  const editing=!!(language?.intent.operation==='update'&&mode==='schedule'&&own&&['accepted','waiting'].includes(n.appointment!.status));
  const assessed=editing?{...n,appointment:undefined}:n;
  const inherited:Appointment|undefined=mode==='confirm'||mode==='cancel'?pending?.payload??own?.payload:undefined;
  const target=language?.intent.destination??language?.expected?.target??inherited?.target??'cafe';
  const goal=language?.intent.goal??language?.expected?.goal??inherited?.goal??'meet';
  const compiled=compileGoalPlan(GOAL_RECIPES[goal],target,n,w);
  const decision=compiled.error?{status:'refused' as const,reason:compiled.error}:assessInvitation(assessed,w,memory,target),eta=meetingTravelMinutes(n,w,target);
  let a:Appointment={id:randomUUID(),target,...decision,...(language?{goal,plan:compiled.plan}:{}),createdMinute:w.minute,updatedMinute:w.minute,deadlineMinute:w.minute+600};
  let reply=decision.reason,mutated=false,updateProposal=false,receiptRow=pending;
  const work=n.workTask?.phase==="active"?(2-n.workTask.progress)*16:0;
  const earliest=w.minute+(eta??0)+work;
  if(own&&(activeAppointment(n.appointment)||n.appointment?.status==="arrived")&&mode!=="cancel"&&!editing){
   // Same visitor asking again reads the existing commitment; never adds a conflicting task.
   a={...n.appointment!};updateProposal=true;receiptRow=own;reply=appointmentReply(a);
   if(mode==="schedule"){const time=language?{minute:absoluteMeetingTime(language.intent.time),error:undefined}:invitationTime(message,w.minute);if(time.error)reply=time.error;else if(time.minute!==a.scheduledMinute)reply="已在赴约途中，改期前请先取消原约定。";}
  }else if(mode==="schedule"){
   const absolute=language&&absoluteMeetingTime(language.intent.time);
   const time=language?{minute:absolute,error:absolute===undefined?'还需要明确见面的世界日期和钟点。':absolute<=w.minute?'这个世界时间已过去，请另选时间。':undefined}:invitationTime(message,w.minute);
   if(editing){a={...n.appointment!,updatedMinute:w.minute};receiptRow=own;updateProposal=true;}
   else if(pending){a={...pending.payload,updatedMinute:w.minute};updateProposal=true;}
   if(language){a.target=target;a.requestedTime=language.intent.time;a.proposalOrigin='player';}
   if(time.error){if(editing)a={...n.appointment!};else if(!pending)a={...a,status:"refused",reason:time.error};reply=time.error;}
   else if(editing&&(!['accepted','deferred'].includes(decision.status)||eta===null||time.minute!<earliest)){
    a={...n.appointment!};reply="这个新时间暂时不能接受，原咖啡馆约定保留。";
   }
   else if(!["accepted","deferred"].includes(decision.status)||eta===null){a={...a,...decision};reply=a.reason;}
   else if(time.minute!<earliest){
    const scheduled=Math.ceil((earliest+10)/10)*10;
    a={...a,status:"proposed",proposalOrigin:'npc',scheduledMinute:scheduled,travelMinutes:eta,departMinute:scheduled-eta-2,deadlineMinute:scheduled+60,waitUntilMinute:scheduled+60,reason:"玩家指定时间赶不及；提出更晚时间，仍须玩家确认。"};
    reply=`那个时间赶不及。${appointmentReply(a)}`;
   }else{
    a={...a,status:"accepted",scheduledMinute:time.minute,confirmedMinute:w.minute,travelMinutes:eta,departMinute:time.minute!-eta-2,deadlineMinute:time.minute!+60,waitUntilMinute:time.minute!+60,reason:"玩家明确咖啡馆及时间，后台校验并接受。"};
    n.appointment=a;mutated=true;reply=appointmentReply(a)+(w.run?.running?"":"小镇暂停中。");
   }
  }else if(mode==="negotiate"){
   if(pending){a={...pending.payload};updateProposal=true;reply=appointmentReply(a);}
   else if(["accepted","deferred"].includes(decision.status)){a={...a,status:"proposed",reason:"玩家提出咖啡馆见面，时间待协商，未确认行动。"};reply=appointmentReply(a);}
   if(language&&a.status==='proposed'){
    a={...a,target,updatedMinute:w.minute,requestedTime:language.intent.time,proposalOrigin:'player'};
    if(language.intent.operation==='update'){delete a.scheduledMinute;delete a.departMinute;delete a.confirmedMinute;}
    reply=appointmentReply(a);
   }
  }else if(mode==="propose"){
   if(pending&&pending.payload.scheduledMinute>w.minute){a={...pending.payload};updateProposal=true;reply=appointmentReply(a);}
   else {
   if(pending){a={...pending.payload,updatedMinute:w.minute};updateProposal=true;}
   if(decision.status==="accepted"||decision.status==="deferred"){
    if(eta===null){a.status="refused";a.reason="没有安全路线，暂时不能约。";reply=a.reason;}
    else{const work=n.workTask?.phase==="active"?(2-n.workTask.progress)*16:0;
     const scheduled=Math.ceil((w.minute+eta+work+30)/10)*10;
     a={...a,status:"proposed",scheduledMinute:scheduled,travelMinutes:eta,departMinute:scheduled-eta-2,deadlineMinute:scheduled+60,waitUntilMinute:scheduled+60,reason:"提出具体世界时间，尚未获得玩家确认。"};reply=appointmentReply(a);
    }
   }else{a={...a,...decision};reply=a.reason;}
   }
  }else if(mode==="confirm"){
   if(!pending){a.status="refused";a.reason="还没有待确认时间，请先邀请我喝咖啡。";reply=a.reason;}
   else{
    a={...pending.payload,updatedMinute:w.minute};updateProposal=true;
    if(a.scheduledMinute===undefined){reply=appointmentReply(a);}
    else if(a.scheduledMinute<=w.minute){a.status="cancelled";a.reason="原定时间已来不及，请重新约一个时间。";reply=a.reason;}
    else if(!["accepted","deferred"].includes(decision.status)||eta===null){a.status="refused";a.reason=decision.reason;reply=a.reason;}
    else if(earliest>a.scheduledMinute){a.scheduledMinute=Math.ceil((earliest+10)/10)*10;a.deadlineMinute=a.scheduledMinute+60;a.waitUntilMinute=a.deadlineMinute;a.reason="先完成手头事务，需要另一个时间，等待确认。";reply=appointmentReply(a);}
    else{a.status="accepted";a.confirmedMinute=w.minute;a.travelMinutes=eta;a.departMinute=a.scheduledMinute!-eta-2;a.reason="玩家确认时间，后台接受会合。";n.appointment=a;mutated=true;reply=appointmentReply(a);}
   }
  }else if(mode==="cancel"){
   const own=(await client.query("SELECT id FROM town_invitations WHERE world_id=$1 AND npc_id=$2 AND visitor_id=$3 AND id=$4",[id,npcId,visitorId,n.appointment?.id??randomUUID()])).rows.length>0;
   if(own&&(activeAppointment(n.appointment)||n.appointment?.status==="arrived"&&n.appointment.scheduledMinute!==undefined)){
    n.appointment={...n.appointment!,status:"cancelled",updatedMinute:w.minute,reason:"发起者取消会合；已开始的移动仍在安全位置结束。"};
    await client.query("UPDATE town_invitations SET payload=$2,updated_at=now() WHERE id=$1",[n.appointment.id,JSON.stringify(n.appointment)]);
    a={...a,status:"cancelled",reason:"我们的咖啡馆约定已取消。"};reply=a.reason;mutated=true;
   }else if(pending){a={...pending.payload,status:"cancelled",updatedMinute:w.minute,reason:"取消尚未确认的时间提议。"};updateProposal=true;reply=a.reason;}
   else{a={...a,status:"refused",reason:"你没有可以取消的进行中约定。"};reply=a.reason;}
  }else if(a.status==="accepted"){
   const scheduled=w.minute+(eta??0);
   a={...a,scheduledMinute:scheduled,departMinute:w.minute,travelMinutes:eta??0,confirmedMinute:w.minute,deadlineMinute:scheduled+60,waitUntilMinute:scheduled+60};
   if(atMeetingPlace(n,target)&&!n.ongoing){a.status="arrived";a.arrivedMinute=w.minute;a.reason="已在约定区域，仍需玩家实际靠近确认会面。";}
   n.appointment=a;mutated=true;reply=appointmentReply(a)+(w.run?.running?"":"小镇暂停中。");
  }
  if(language&&mode!=='cancel'){
   // Only new/updated commitments compile a plan; repeated queries never reset its cursor.
   if(a.status==='proposed'||mutated){a.goal=goal;a.plan=compiled.plan;}
   if(mutated&&!waitsForPlayer(a.plan)&&a.status==='arrived'){a.status='accepted';delete a.arrivedMinute;}
   if(mutated&&a.plan&&a.status==='arrived')a.plan.cursor=1;
   if(a.goal&&!waitsForPlayer(a.plan))reply=appointmentReply(a);
  }
  // A new confirmed meeting supersedes only this visitor's outstanding proposal.
  if(pending&&!updateProposal&&mutated&&mode==="invite")await client.query("UPDATE town_invitations SET payload=payload||$2::jsonb,updated_at=now() WHERE id=$1",[pending.id,JSON.stringify({status:"cancelled",updatedMinute:w.minute,reason:"改为本次立即赴约。"})]);
  if(mutated){
   w.revision++;w.events.push({id:w.revision*1000+700,minute:w.minute,npcId,text:`${n.name}${mode==="cancel"?"取消了":"确认了"}${meetingName(a.target)}会合约定`,reason:"后台确认；不公开访客身份或私聊原文。"});w.events=w.events.slice(-100);assertWorld(w);
   await client.query("UPDATE town_worlds SET revision=$2,payload=$3,updated_at=now() WHERE id=$1",[id,w.revision,JSON.stringify(w)]);
  }
  if(a.target!=='cafe')reply=reply.replaceAll('麦香咖啡馆',meetingName(a.target)).replaceAll('咖啡馆',meetingName(a.target));
  const unchangedProposal=updateProposal&&a.status==="proposed"&&receiptRow?.response.message===message&&receiptRow.response.reply===reply&&receiptRow.response.worldRevision===w.revision;
  const turn:ChatTurn=unchangedProposal?receiptRow.response:{id:randomUUID(),message,reply,source:"fallback",reason:"controlled_action",minute:w.minute,worldRevision:w.revision,createdAt:new Date().toISOString(),...(language?{requestId,meetingIntent:{operation:language.intent.operation}}:{})};
  if(updateProposal){
   const receipts=receiptRow?.response?.receipts??[];
   if(receipts.length>=32&&mode!=="cancel")throw new StoreError(429,"这次约定已经协商多次，请查看已有约定或取消后重新邀请。");
   const receipt={receipts:[...receipts,{requestId,turn}],...(mutated&&a.status==="accepted"?{confirmation:{requestId,turn}}:{})};
   await client.query("UPDATE town_invitations SET payload=$2,response=response||$3::jsonb,updated_at=now() WHERE id=$1",[a.id,JSON.stringify(a),JSON.stringify(receipt)]);
  }
  else await client.query("INSERT INTO town_invitations(world_id,npc_id,visitor_id,request_id,id,payload,response) VALUES($1,$2,$3,$4,$5,$6,$7)",[id,npcId,visitorId,requestId,a.id,JSON.stringify(a),JSON.stringify(turn)]);
  const repeatedTurn=history.some(t=>t.id===turn.id);
  await client.query("INSERT INTO town_private_chats(world_id,npc_id,visitor_id,turns,player_memory) VALUES($1,$2,$3,$4,$5) ON CONFLICT(world_id,npc_id,visitor_id) DO UPDATE SET turns=EXCLUDED.turns,player_memory=EXCLUDED.player_memory,updated_at=now()",[id,npcId,visitorId,JSON.stringify((repeatedTurn?history:[...history,turn]).slice(-HISTORY_TURNS)),JSON.stringify(repeatedTurn?memory:rememberPlayer(memory,turn))]);
  await client.query("COMMIT");return turn;
 }catch(e){await client.query("ROLLBACK");throw e;}
}
export async function appointmentStatusReply(id:string,npcId:string,visitorId:string){return appointmentReply((await privateAppointments(id,npcId,visitorId))[0]);}

// The local player position is reported by the browser, not a server-simulated avatar.
// Validate ownership, scene, collision and proximity; never accept an appointment ID from it.
export async function recordMeeting(id:string,npcId:string,visitorId:string,presence:unknown){
 const p=presence as Partial<Player>|null;
 if(!p?.sceneId||!Object.hasOwn(SCENES,p.sceneId)||!p.position||!Number.isFinite(p.position.x)||!Number.isFinite(p.position.y)||!canStand(p.sceneId,p.position))throw new StoreError(400,"请在约定场景的合法位置靠近居民。");
 const client=await database().connect();await client.query("BEGIN");
 try{
  const row=(await client.query("SELECT payload FROM town_worlds WHERE id=$1 FOR UPDATE",[id])).rows[0];if(!row)throw new StoreError(404,"世界不存在");
  const w=restoreWorld(row.payload),n=w.npcs.find(n=>n.id===npcId);if(!n)throw new StoreError(404,"居民不存在");
  const a=n.appointment;
  const own=a&&(await client.query("SELECT id FROM town_invitations WHERE world_id=$1 AND npc_id=$2 AND visitor_id=$3 AND id=$4",[id,npcId,visitorId,a.id])).rows.length>0;
  if(!own||!a||!["arrived","met"].includes(a.status)||a.scheduledMinute===undefined){await client.query("COMMIT");return {meeting:null};}
  if(a.status==="met"){await client.query("COMMIT");return {meeting:a};}
  if(w.minute>=(a.waitUntilMinute??a.deadlineMinute)||p.sceneId!==meetingPlace(a.target,n.id)?.sceneId||!atMeetingPlace(n,a.target)||!nearbyResidents({version:1,sceneId:p.sceneId,position:p.position,facing:"south"},[n]).length)throw new StoreError(409,"还没有在约定区域近处见到这位居民。");
  Object.assign(a,{status:"met",metMinute:w.minute,updatedMinute:w.minute,reason:"本访客在约定区域发起近距离交流；后台校验同场景合法站位与距离。"});
  if(a.plan)a.plan.cursor=a.plan.steps.length;
  w.revision++;w.events.push({id:w.revision*1000+701,minute:w.minute,npcId,text:`${n.name}在${meetingName(a.target)}完成了一次会面`,reason:"不公开访客姓名、身份或私聊内容。"});w.events=w.events.slice(-100);assertWorld(w);
  await client.query("UPDATE town_worlds SET revision=$2,payload=$3,updated_at=now() WHERE id=$1",[id,w.revision,JSON.stringify(w)]);
  await client.query("UPDATE town_invitations SET payload=$2,response=response||$3::jsonb,updated_at=now() WHERE id=$1",[a.id,JSON.stringify(a),JSON.stringify({meetingEvidence:{minute:w.minute,revision:w.revision,sceneId:p.sceneId,position:p.position,source:"validated_client_presence"}})]);
  await client.query("COMMIT");return {meeting:a};
 }catch(e){await client.query("ROLLBACK");throw e;}finally{client.release();}
}
