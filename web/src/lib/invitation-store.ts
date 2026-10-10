import type {PoolClient} from "pg";
import {randomUUID} from "node:crypto";
import {database,StoreError} from "./store";
import {assertWorld,restoreWorld} from "./world";
import {activeAppointment,assessInvitation,appointmentReply,cafeTravelMinutes,type Appointment} from "./appointments";
import {playerMemory,rememberPlayer} from "./player-memory";
import {HISTORY_TURNS,type ChatTurn} from "./chat-types";
import {recallRequest,retrievePlayerFacts,type InvitationSource} from "./chat-facts";
import {canStand} from "./scene-data";
import {nearbyResidents} from "./interaction";
import type {Player} from "./player-scene";

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
     ORDER BY CASE WHEN payload->>'status' IN ('accepted','waiting','travelling') THEN 0
       WHEN payload->>'status'='arrived' AND (payload->>'waitUntilMinute')::int>(w.payload->>'minute')::int THEN 0
       WHEN payload->>'status'='proposed' AND (payload->>'scheduledMinute')::int>(w.payload->>'minute')::int THEN 1 ELSE 2 END,updated_at DESC,id DESC LIMIT 8
   ) recent),'[]'::json) AS appointments,
   COALESCE((SELECT json_agg(json_build_object('appointment',important.payload,'confirmation',important.response)) FROM (
     SELECT payload,response FROM town_invitations WHERE world_id=w.id AND npc_id=$2 AND visitor_id=$3
     AND ($4::int IS NULL AND $5::int IS NULL OR EXISTS (
       SELECT 1 FROM (VALUES ((payload->>'createdMinute')::int),((payload->>'arrivedMinute')::int),((payload->>'confirmedMinute')::int),((payload->>'metMinute')::int),((payload->>'updatedMinute')::int)) AS event_time(minute)
       WHERE floor(event_time.minute/1440.0)+1=COALESCE($4::int,floor((w.payload->>'minute')::numeric/1440)+1+$5::int)
     ))
     ORDER BY CASE payload->>'status' WHEN 'met' THEN 0 WHEN 'arrived' THEN 1 WHEN 'missed' THEN 1 WHEN 'cancelled' THEN 1 WHEN 'failed' THEN 1
       WHEN 'accepted' THEN 2 WHEN 'waiting' THEN 2 WHEN 'travelling' THEN 2 ELSE 3 END,
       (payload->>'updatedMinute')::int DESC,id DESC LIMIT 6
   ) important),'[]'::json) AS sources
   FROM town_worlds w WHERE w.id=$1`,[id,npcId,visitorId,query.day,query.relative]);
 if(!result.rows.length)throw new StoreError(404,"世界不存在");
 const world=restoreWorld(result.rows[0].payload);
 return {world,appointments:result.rows[0].appointments as Appointment[],recall:retrievePlayerFacts(result.rows[0].sources as InvitationSource[],message,world.minute,world.npcs.find(n=>n.id===npcId)?.name)};
}
// Called with the existing NPC reply lock. This short transaction contains NO model I/O.
export async function confirmInvitation(client:PoolClient,id:string,npcId:string,visitorId:string,message:string,requestId:string,mode:"invite"|"propose"|"confirm"|"cancel"="invite"):Promise<ChatTurn>{
 await client.query("BEGIN");
 try{
  const prior=await client.query("SELECT response FROM town_invitations WHERE world_id=$1 AND npc_id=$2 AND visitor_id=$3 AND (request_id=$4::uuid OR response->'confirmation'->>'requestId'=$4::text)",[id,npcId,visitorId,requestId]);
  if(prior.rows.length){const r=prior.rows[0].response;const turn=r.confirmation?.requestId===requestId?r.confirmation.turn:r;if(turn.message!==message)throw new StoreError(409,"同一请求编号不能用于另一条消息。");await client.query("COMMIT");return turn;}
  const row=(await client.query("SELECT payload FROM town_worlds WHERE id=$1 FOR UPDATE",[id])).rows[0];
  if(!row)throw new StoreError(404,"世界不存在");
  const w=restoreWorld(row.payload),n=w.npcs.find(n=>n.id===npcId);if(!n)throw new StoreError(404,"居民不存在");
  const old=(await client.query("SELECT turns,player_memory FROM town_private_chats WHERE world_id=$1 AND npc_id=$2 AND visitor_id=$3",[id,npcId,visitorId])).rows[0];
  const history:ChatTurn[]=old?.turns??[],memory=playerMemory(old?.player_memory,history);
  const pending=(await client.query("SELECT id,payload,response FROM town_invitations WHERE world_id=$1 AND npc_id=$2 AND visitor_id=$3 AND payload->>'status'='proposed' ORDER BY updated_at DESC LIMIT 1",[id,npcId,visitorId])).rows[0];
  const decision=assessInvitation(n,w,memory),eta=cafeTravelMinutes(n,w);
  let a:Appointment={id:randomUUID(),target:"cafe",...decision,createdMinute:w.minute,updatedMinute:w.minute,deadlineMinute:w.minute+600};
  let reply=decision.reason,mutated=false,updateProposal=false;
  if(mode==="propose"){
   if(pending&&pending.payload.scheduledMinute>w.minute){await client.query("COMMIT");return pending.response;}
   if(decision.status==="accepted"||decision.status==="deferred"){
    if(eta===null){a.status="refused";a.reason="没有安全路线，暂时不能约。";reply=a.reason;}
    else{const work=n.workTask?.phase==="active"?(2-n.workTask.progress)*16:0;
     const scheduled=Math.ceil((w.minute+eta+work+30)/10)*10;
     a={...a,status:"proposed",scheduledMinute:scheduled,travelMinutes:eta,departMinute:scheduled-eta-2,deadlineMinute:scheduled+60,waitUntilMinute:scheduled+60,reason:"提出具体世界时间，尚未获得玩家确认。"};reply=appointmentReply(a);
    }
   }
  }else if(mode==="confirm"){
   if(!pending){a.status="refused";a.reason="还没有待确认时间，请先邀请我喝咖啡。";reply=a.reason;}
   else{
    a={...pending.payload,updatedMinute:w.minute};updateProposal=true;
    if(a.scheduledMinute!<=w.minute||(eta!==null&&w.minute+eta>a.scheduledMinute!)){a.status="cancelled";a.reason="原定时间已来不及，请重新约一个时间。";reply=a.reason;}
    else if(!["accepted","deferred"].includes(decision.status)||eta===null){a.status="refused";a.reason=decision.reason;reply=a.reason;}
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
   if(n.sceneId==="cafe_interior"&&!n.ongoing){a.status="arrived";a.arrivedMinute=w.minute;a.reason="已在咖啡馆，仍需玩家实际靠近确认会面。";}
   n.appointment=a;mutated=true;reply=appointmentReply(a)+(w.run?.running?"":"小镇暂停中。");
  }
  // A new confirmed meeting supersedes only this visitor's outstanding proposal.
  if(pending&&!updateProposal&&mutated&&mode==="invite")await client.query("UPDATE town_invitations SET payload=payload||$2::jsonb,updated_at=now() WHERE id=$1",[pending.id,JSON.stringify({status:"cancelled",updatedMinute:w.minute,reason:"改为本次立即赴约。"})]);
  if(mutated){
   w.revision++;w.events.push({id:w.revision*1000+700,minute:w.minute,npcId,text:`${n.name}${mode==="cancel"?"取消了":"确认了"}咖啡馆会合约定`,reason:"后台确认；不公开访客身份或私聊原文。"});w.events=w.events.slice(-100);assertWorld(w);
   await client.query("UPDATE town_worlds SET revision=$2,payload=$3,updated_at=now() WHERE id=$1",[id,w.revision,JSON.stringify(w)]);
  }
  const turn:ChatTurn={id:randomUUID(),message,reply,source:"fallback",reason:"controlled_action",minute:w.minute,worldRevision:w.revision,createdAt:new Date().toISOString()};
  if(updateProposal)await client.query("UPDATE town_invitations SET payload=$2,response=response||$3::jsonb,updated_at=now() WHERE id=$1",[a.id,JSON.stringify(a),JSON.stringify({confirmation:{requestId,turn}})]);
  else await client.query("INSERT INTO town_invitations(world_id,npc_id,visitor_id,request_id,id,payload,response) VALUES($1,$2,$3,$4,$5,$6,$7)",[id,npcId,visitorId,requestId,a.id,JSON.stringify(a),JSON.stringify(turn)]);
  await client.query("INSERT INTO town_private_chats(world_id,npc_id,visitor_id,turns,player_memory) VALUES($1,$2,$3,$4,$5) ON CONFLICT(world_id,npc_id,visitor_id) DO UPDATE SET turns=EXCLUDED.turns,player_memory=EXCLUDED.player_memory,updated_at=now()",[id,npcId,visitorId,JSON.stringify([...history,turn].slice(-HISTORY_TURNS)),JSON.stringify(rememberPlayer(memory,turn))]);
  await client.query("COMMIT");return turn;
 }catch(e){await client.query("ROLLBACK");throw e;}
}
export async function appointmentStatusReply(id:string,npcId:string,visitorId:string){return appointmentReply((await privateAppointments(id,npcId,visitorId))[0]);}

// The local player position is reported by the browser, not a server-simulated avatar.
// Validate ownership, scene, collision and proximity; never accept an appointment ID from it.
export async function recordMeeting(id:string,npcId:string,visitorId:string,presence:unknown){
 const p=presence as Partial<Player>|null;
 if(p?.sceneId!=="cafe_interior"||!p.position||!Number.isFinite(p.position.x)||!Number.isFinite(p.position.y)||!canStand("cafe_interior",p.position))throw new StoreError(400,"请在咖啡馆的合法位置靠近居民。");
 const client=await database().connect();await client.query("BEGIN");
 try{
  const row=(await client.query("SELECT payload FROM town_worlds WHERE id=$1 FOR UPDATE",[id])).rows[0];if(!row)throw new StoreError(404,"世界不存在");
  const w=restoreWorld(row.payload),n=w.npcs.find(n=>n.id===npcId);if(!n)throw new StoreError(404,"居民不存在");
  const a=n.appointment;
  const own=a&&(await client.query("SELECT id FROM town_invitations WHERE world_id=$1 AND npc_id=$2 AND visitor_id=$3 AND id=$4",[id,npcId,visitorId,a.id])).rows.length>0;
  if(!own||!a||!["arrived","met"].includes(a.status)||a.scheduledMinute===undefined){await client.query("COMMIT");return {meeting:null};}
  if(a.status==="met"){await client.query("COMMIT");return {meeting:a};}
  if(w.minute>=(a.waitUntilMinute??a.deadlineMinute)||!nearbyResidents({version:1,sceneId:"cafe_interior",position:p.position,facing:"south"},[n]).length)throw new StoreError(409,"还没有在咖啡馆近处见到这位居民。");
  Object.assign(a,{status:"met",metMinute:w.minute,updatedMinute:w.minute,reason:"本访客在咖啡馆发起近距离交流；后台校验同场景合法站位与距离。"});
  w.revision++;w.events.push({id:w.revision*1000+701,minute:w.minute,npcId,text:`${n.name}在咖啡馆完成了一次会面`,reason:"不公开访客姓名、身份或私聊内容。"});w.events=w.events.slice(-100);assertWorld(w);
  await client.query("UPDATE town_worlds SET revision=$2,payload=$3,updated_at=now() WHERE id=$1",[id,w.revision,JSON.stringify(w)]);
  await client.query("UPDATE town_invitations SET payload=$2,response=response||$3::jsonb,updated_at=now() WHERE id=$1",[a.id,JSON.stringify(a),JSON.stringify({meetingEvidence:{minute:w.minute,revision:w.revision,sceneId:p.sceneId,position:p.position,source:"validated_client_presence"}})]);
  await client.query("COMMIT");return {meeting:a};
 }catch(e){await client.query("ROLLBACK");throw e;}finally{client.release();}
}
