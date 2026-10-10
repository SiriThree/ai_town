import type {PoolClient} from "pg";
import {randomUUID} from "node:crypto";
import {database,StoreError} from "./store";
import {assertWorld,restoreWorld} from "./world";
import {activeAppointment,assessInvitation,appointmentReply,type Appointment} from "./appointments";
import {playerMemory,rememberPlayer} from "./player-memory";
import {HISTORY_TURNS,type ChatTurn} from "./chat-types";

export async function privateAppointments(worldId:string,npcId:string,visitorId:string):Promise<Appointment[]>{
 const r=await database().query("SELECT payload FROM town_invitations WHERE world_id=$1 AND npc_id=$2 AND visitor_id=$3 ORDER BY updated_at DESC,id DESC LIMIT 8",[worldId,npcId,visitorId]);
 return r.rows.map(row=>row.payload);
}
// Called with the existing NPC reply lock. This short transaction contains NO model I/O.
export async function confirmInvitation(client:PoolClient,id:string,npcId:string,visitorId:string,message:string,requestId:string,cancel=false):Promise<ChatTurn>{
 await client.query("BEGIN");
 try{
  const prior=await client.query("SELECT response FROM town_invitations WHERE world_id=$1 AND npc_id=$2 AND visitor_id=$3 AND request_id=$4",[id,npcId,visitorId,requestId]);
  if(prior.rows.length){if(prior.rows[0].response.message!==message)throw new StoreError(409,"同一请求编号不能用于另一条消息。");await client.query("COMMIT");return prior.rows[0].response;}
  const row=(await client.query("SELECT payload FROM town_worlds WHERE id=$1 FOR UPDATE",[id])).rows[0];
  if(!row)throw new StoreError(404,"世界不存在");
  const w=restoreWorld(row.payload),n=w.npcs.find(n=>n.id===npcId)!;
  const old=(await client.query("SELECT turns,player_memory FROM town_private_chats WHERE world_id=$1 AND npc_id=$2 AND visitor_id=$3",[id,npcId,visitorId])).rows[0];
  const history:ChatTurn[]=old?.turns??[],memory=playerMemory(old?.player_memory,history);
  const decision=assessInvitation(n,w,memory);
  let a:Appointment={id:randomUUID(),target:"cafe",...decision,createdMinute:w.minute,updatedMinute:w.minute,deadlineMinute:w.minute+600};
  let reply=decision.reason,mutated=false;
  if(cancel){
   const own=(await client.query("SELECT id FROM town_invitations WHERE world_id=$1 AND npc_id=$2 AND visitor_id=$3 AND id=$4",[id,npcId,visitorId,n.appointment?.id??randomUUID()])).rows.length>0;
   if(own&&activeAppointment(n.appointment)){
    n.appointment={...n.appointment!,status:"cancelled",updatedMinute:w.minute,reason:"发起者取消会合；已开始的移动仍在安全位置结束。"};
    await client.query("UPDATE town_invitations SET payload=$2,updated_at=now() WHERE id=$1",[n.appointment.id,JSON.stringify(n.appointment)]);
    a={...a,status:"cancelled",reason:"我们的咖啡馆约定已取消。"};reply=a.reason;mutated=true;
   }else{a={...a,status:"refused",reason:"你没有可以取消的进行中约定。"};reply=a.reason;}
  }else if(a.status==="accepted"){
   if(n.sceneId==="cafe_interior"&&!n.ongoing){a.status="arrived";a.arrivedMinute=w.minute;a.reason="接受时双方约定的居民已在咖啡馆。";reply="我就在咖啡馆，你可以过来找我。";}
   n.appointment=a;mutated=true;
  }
  if(mutated){
   w.revision++;w.events.push({id:w.revision*1000+700,minute:w.minute,npcId,text:`${n.name}${cancel?"取消了":"确认了"}咖啡馆会合约定`,reason:"后台确认；不公开访客身份或私聊原文。"});w.events=w.events.slice(-100);assertWorld(w);
   await client.query("UPDATE town_worlds SET revision=$2,payload=$3,updated_at=now() WHERE id=$1",[id,w.revision,JSON.stringify(w)]);
  }
  const turn:ChatTurn={id:randomUUID(),message,reply,source:"fallback",reason:"controlled_action",minute:w.minute,worldRevision:w.revision,createdAt:new Date().toISOString()};
  await client.query("INSERT INTO town_invitations(world_id,npc_id,visitor_id,request_id,id,payload,response) VALUES($1,$2,$3,$4,$5,$6,$7)",[id,npcId,visitorId,requestId,a.id,JSON.stringify(a),JSON.stringify(turn)]);
  await client.query("INSERT INTO town_private_chats(world_id,npc_id,visitor_id,turns,player_memory) VALUES($1,$2,$3,$4,$5) ON CONFLICT(world_id,npc_id,visitor_id) DO UPDATE SET turns=EXCLUDED.turns,player_memory=EXCLUDED.player_memory,updated_at=now()",[id,npcId,visitorId,JSON.stringify([...history,turn].slice(-HISTORY_TURNS)),JSON.stringify(rememberPlayer(memory,turn))]);
  await client.query("COMMIT");return turn;
 }catch(e){await client.query("ROLLBACK");throw e;}
}
export async function appointmentStatusReply(id:string,npcId:string,visitorId:string){return appointmentReply((await privateAppointments(id,npcId,visitorId))[0]);}
