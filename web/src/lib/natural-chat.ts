import {randomUUID} from 'node:crypto';
import type {PoolClient} from 'pg';
import {modelReply} from './chat-model';
import {buildMessages} from './chat-context';
import {absoluteMeetingTime,parseUnderstanding,UNDERSTANDING_INSTRUCTION,expressionInstruction,type MeetingIntent} from './meeting-language';
import {confirmInvitation,privateConversationState} from './invitation-store';
import {appointmentReply,type Appointment} from './appointments';
import {StoreError} from './store';
import {reserveChatQuota} from './chat-limits';
import {HISTORY_TURNS,type ChatTurn,type ChatReply} from './chat-types';
import {playerMemory,rememberPlayer,introducedName,asksPlayerName,recognitionReply} from './player-memory';
import {checkChatFacts} from './chat-facts';
import {MEETING_PLACES} from './meeting-places';
import {gatheringKnowledge,gatheringRecall} from './gatherings';

type Snapshot=Awaited<ReturnType<typeof privateConversationState>>;
type Outcome={code:'saved'|'status'|'clarify'|'unsupported'|'stale';explanation:string;appointment?:Appointment;running:boolean};

async function receipt(client:PoolClient,world:string,npc:string,visitor:string,request:string,message:string):Promise<ChatTurn|undefined>{
 const rows=await client.query("SELECT request_id,response FROM town_invitations WHERE world_id=$1 AND npc_id=$2 AND visitor_id=$3 AND (request_id=$4::uuid OR response->'confirmation'->>'requestId'=$4::text OR response->'receipts' @> $5::jsonb)",[world,npc,visitor,request,JSON.stringify([{requestId:request}])]);
 const r=rows.rows[0];if(!r)return;
 const turn=r.request_id===request?r.response:r.response.receipts?.find((t:{requestId:string})=>t.requestId===request)?.turn??r.response.confirmation?.turn;
 if(turn?.message!==message)throw new StoreError(409,'同一请求编号不能用于另一条消息。');
 return turn;
}

/** Keep the committed deterministic receipt if the process dies before natural expression. */
async function save(client:PoolClient,world:string,npc:string,visitor:string,turn:ChatTurn){
 await client.query('BEGIN');
 try{
  const old=(await client.query('SELECT turns,player_memory FROM town_private_chats WHERE world_id=$1 AND npc_id=$2 AND visitor_id=$3 FOR UPDATE',[world,npc,visitor])).rows[0];
  const history:ChatTurn[]=old?.turns??[],exists=history.some(t=>t.id===turn.id),turns=exists?history.map(t=>t.id===turn.id?turn:t):[...history,turn];
  const memory=playerMemory(old?.player_memory,history);
  await client.query('INSERT INTO town_private_chats(world_id,npc_id,visitor_id,turns,player_memory) VALUES($1,$2,$3,$4,$5) ON CONFLICT(world_id,npc_id,visitor_id) DO UPDATE SET turns=EXCLUDED.turns,player_memory=EXCLUDED.player_memory,updated_at=now()',[world,npc,visitor,JSON.stringify(turns.slice(-HISTORY_TURNS)),JSON.stringify(exists?memory:rememberPlayer(memory,turn))]);
  const rows=await client.query("SELECT id,request_id,response FROM town_invitations WHERE world_id=$1 AND npc_id=$2 AND visitor_id=$3 AND (request_id=$4::uuid OR response->'confirmation'->>'requestId'=$4::text OR response->'receipts' @> $5::jsonb) FOR UPDATE",[world,npc,visitor,turn.requestId,JSON.stringify([{requestId:turn.requestId}])]);
  for(const row of rows.rows){
   const r=row.response;if(row.request_id===turn.requestId){delete r.reason;delete r.factCheck;Object.assign(r,turn);}
   if(r.confirmation?.requestId===turn.requestId)r.confirmation.turn=turn;
   if(r.receipts)r.receipts=r.receipts.map((v:{requestId:string;turn:ChatTurn})=>v.requestId===turn.requestId?{...v,turn}:v);
   await client.query('UPDATE town_invitations SET response=$2 WHERE id=$1',[row.id,JSON.stringify(r)]);
  }
  await client.query('COMMIT');return turn;
 }catch(e){await client.query('ROLLBACK');throw e;}
}

// Only explicit observable conflicts are caught here; this is not a second semantic model.
export function checkMeetingSpeech(reply:ChatReply,outcome:Outcome):ChatReply{
 if(reply.source!=='ai')return reply;
 const a=outcome.appointment,clauses=reply.reply.split(/[，。！？；,!?;]/).filter(s=>!/(没|未|不能|不行|不支持|不去|取消|还没|如果|要不|好吗|可以吗|怎么样|昨天|前天|之前|曾经|上次|当时|那天)/.test(s));
 const promise=clauses.some(s=>/说好|答应|约好了|到时见|等我|我.*(?:就去|就来|过去|过来)|(?:点|咖啡馆|广场).*见/.test(s));
 const permitted=!!a&&['accepted','waiting','travelling','arrived','executing','completed','met'].includes(a.status);
 const falsePlace=!!a&&clauses.some(s=>MEETING_PLACES.some(p=>p.id!==a.target&&p.aliases.some(name=>s.includes(name))&&/见|等你/.test(s)));
 const falseArrival=clauses.some(s=>/已经到了|已经到达|我到.{0,12}了$/.test(s))&&!['arrived','met','executing','completed'].includes(a?.status??'');
 const falseCompletion=a?.plan&&a.plan.cursor<a.plan.steps.length&&clauses.some(s=>/已经(?:做完|完成|整理好)|都(?:做完|完成|整理好)了/.test(s));
 const falseMet=clauses.some(s=>/我们.*见过面|我们.*见面了/.test(s))&&a?.status!=='met';
 const timeClaims=[...reply.reply.matchAll(/(?:下午|上午|晚上)?([零一二两三四五六七八九十\d]{1,2})(?:点|:(\d{2}))/g)];
 const hours:Record<string,number>={零:0,一:1,二:2,两:2,三:3,四:4,五:5,六:6,七:7,八:8,九:9,十:10,十一:11,十二:12};
 const falseTime=a?.scheduledMinute!==undefined&&timeClaims.some(m=>{const h=Number.isFinite(Number(m[1]))?Number(m[1]):hours[m[1]],expected=Math.floor(a.scheduledMinute!%1440/60);return h!==undefined&&(h%12!==expected%12||m[2]!==undefined&&Number(m[2])!==a.scheduledMinute!%60);});
 if(!permitted&&promise||falsePlace||falseArrival||falseMet||falseTime||falseCompletion)return {reply:outcome.explanation,source:'fallback',reason:'fact_conflict',factCheck:{code:'meeting_result',originalReply:reply.reply,sourceIds:a?[a.id]:[]}};
 return reply;
}

export async function naturalChat(client:PoolClient,world:string,npcId:string,visitor:string,message:string,requestId:string,history:ChatTurn[],snapshot:Snapshot):Promise<{turn:ChatTurn}|{failed:ChatReply}>{
 const old=await receipt(client,world,npcId,visitor,requestId,message)??history.find(t=>t.requestId===requestId);
 if(old){if(old.message!==message)throw new StoreError(409,'同一请求编号不能用于另一条消息。');return {turn:old};}
 const npc=snapshot.world.npcs.find(n=>n.id===npcId)!;
 const stored=(await client.query('SELECT player_memory FROM town_private_chats WHERE world_id=$1 AND npc_id=$2 AND visitor_id=$3',[world,npcId,visitor])).rows[0]?.player_memory;
 const memory=playerMemory(stored,history),turnId=randomUUID();
 const introduction=introducedName(message),contextMemory=introduction?rememberPlayer(memory,{id:turnId,message,reply:'',source:'fallback',worldRevision:snapshot.world.revision,minute:snapshot.world.minute,createdAt:new Date().toISOString()}):memory;
 const messages=buildMessages(npc,snapshot.world,history,message,contextMemory,snapshot.appointments,snapshot.recall);
 const interpreted=await modelReply([UNDERSTANDING_INSTRUCTION,...messages],()=>'',undefined,undefined,undefined,()=>reserveChatQuota(world,'model'),true);
 if(interpreted.source!=='ai')return {failed:interpreted};
 const understanding=parseUnderstanding(interpreted.reply);
 if(!understanding)return {failed:{reply:'',source:'fallback',reason:'invalid_response'}};
 let reply:ChatReply,canonical:ChatTurn|undefined,outcome:Outcome|undefined;
 if(understanding.kind==='chat')reply={...interpreted,reply:understanding.reply};
 else{
  const i=understanding.intent,reference=i.referenceId?snapshot.appointments.find(a=>a.id===i.referenceId):undefined;
  outcome={code:'clarify',explanation:'你想在哪里、什么时间见面？可以再说清楚些吗？',running:!!snapshot.world.run?.running};
  if(i.confidence<0.85||i.operation==='clarify'){outcome.explanation='目前条件还不明确，请追问玩家具体地点或日期钟点，不能安排或承诺。';}
  else if(i.referenceId&&!reference||['update','confirm','decline','cancel'].includes(i.operation)&&!reference){outcome.explanation='没有找到属于本访客的对应提议，请先明确要商量的安排。';}
  else if(i.operation==='status'){outcome={...outcome,code:'status',appointment:reference??snapshot.appointments[0],explanation:appointmentReply(reference??snapshot.appointments[0])};}
  else{
   const destination=i.destination??reference?.target;
   const intent:MeetingIntent={...i,goal:i.goal??(reference?reference.goal??'meet':null),destination:destination??null};
   if(i.operation==='update'&&i.timing==='unspecified'&&reference?.scheduledMinute!==undefined){const m=reference.scheduledMinute;intent.time={day:Math.floor(m/1440)+1,hour:Math.floor(m%1440/60),minute:m%60};intent.timing='scheduled';}
   const complete=absoluteMeetingTime(intent.time)!==undefined;
   let mode:'cancel'|'confirm'|'schedule'|'invite'|'negotiate'|undefined;
   if(i.operation==='cancel'||i.operation==='decline')mode='cancel';
   else if(i.operation==='confirm')mode='confirm';
   else if(destination&&intent.goal)mode=intent.timing==='now'?'invite':complete?'schedule':'negotiate';
   if(mode){
    try{canonical=await confirmInvitation(client,world,npcId,visitor,message,requestId,mode,{intent,expected:reference});}
    catch(e){if(!(e instanceof StoreError&&e.status===409))throw e;outcome={...outcome,code:'stale',explanation:e.message};}
    if(canonical){const fresh=await privateConversationState(client,world,npcId,visitor,message);outcome={code:'saved',explanation:canonical.reply,appointment:fresh.appointments[0],running:!!fresh.world.run?.running};snapshot=fresh;}
   }
  }
  const current=snapshot.world.npcs.find(n=>n.id===npcId)!;
  const after=buildMessages(current,snapshot.world,history,message,contextMemory,snapshot.appointments,snapshot.recall);
  reply=await modelReply([...after,expressionInstruction(outcome)],()=>canonical?.reply??(outcome!.code==='status'?outcome!.explanation:'这次还没确定，你想约在哪里、几点呢？'),undefined,undefined,undefined,()=>reserveChatQuota(world,'model'));
  reply=checkMeetingSpeech(reply,outcome);
 }
 // World ticks are never held for either model request. Reject stale generated commitments.
 const latest=await privateConversationState(client,world,npcId,visitor,message),current=latest.world.npcs.find(n=>n.id===npcId)!;
 if(outcome?.appointment){const a=latest.appointments.find(a=>a.id===outcome!.appointment!.id);if(a&&(a.status!==outcome.appointment.status||a.scheduledMinute!==outcome.appointment.scheduledMinute))reply={reply:appointmentReply(a),source:'fallback',reason:'fact_conflict',factCheck:{code:'changed_during_expression',originalReply:reply.reply,sourceIds:[a.id]}};}
 if(understanding.kind==='chat')reply=checkMeetingSpeech(reply,{code:'status',explanation:appointmentReply(latest.appointments[0]),appointment:latest.appointments[0],running:!!latest.world.run?.running});
 reply=checkChatFacts(reply,current,latest.world,latest.recall);
 if(reply.source==='ai'&&(introduction||asksPlayerName(message))&&(!contextMemory.name||!reply.reply.includes(contextMemory.name)||/不知道|不记得|没告诉/.test(reply.reply)))reply={reply:recognitionReply(message,contextMemory)!,source:'fallback',reason:'fact_conflict'};
 const publicRecall=gatheringRecall(current,latest.world,message);
 if(publicRecall&&reply.source==='ai'&&!gatheringKnowledge(latest.world,current,message).firsthandFacts.length&&/我.*(?:参加了|参加过|去了|去过|在场|到场)|我们.*(?:聚会|聊过)/.test(reply.reply))reply={reply:publicRecall,source:'fallback',reason:'fact_conflict'};
 const turn:ChatTurn={...(canonical??{id:turnId,message,minute:latest.world.minute,worldRevision:latest.world.revision,createdAt:new Date().toISOString()}),...reply,requestId,semantic:{interpretation:understanding,outcome,expressionSource:reply.source}};
 if(reply.source==='ai')delete turn.reason;
 return {turn:await save(client,world,npcId,visitor,turn)};
}
