import {randomUUID} from "node:crypto";
import {database,readWorld,StoreError} from "./store";
import {assertWorld,restoreWorld} from "./world";
import {activeGathering,validateNotice,notifyGathering,rememberResponses,type Gathering} from "./gatherings";
import {canStand} from "./scene-data";
import {nearbyResidents} from "./interaction";
import {recordExperience} from "./experiences";
import type {Player} from "./player-scene";

export async function notices(id:string,visitor:string){
 const w=await readWorld(id),owned=await database().query("SELECT id FROM town_notice_owners WHERE world_id=$1 AND visitor_id=$2",[id,visitor]);
 return {world:w,ownedIds:owned.rows.map(r=>r.id as string)};
}
export async function changeNotice(id:string,visitor:string,input:unknown){
 const b=input as {action?:unknown;requestId?:unknown;id?:unknown}|null;
 if(!b||!["publish","cancel"].includes(String(b.action)))throw new StoreError(400,"公告操作无效。");
 if(typeof b.requestId!=="string"||! /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(b.requestId))throw new StoreError(400,"请求编号无效。");
 const c=await database().connect();
 try{
  await c.query("BEGIN");
  const row=(await c.query("SELECT payload FROM town_worlds WHERE id=$1 FOR UPDATE",[id])).rows[0];if(!row)throw new StoreError(404,"世界不存在。");
  const w=restoreWorld(row.payload);w.gatherings??=[];
  if(b.action==="publish"){
   const prior=(await c.query("SELECT id,request FROM town_notice_owners WHERE world_id=$1 AND visitor_id=$2 AND request_id=$3",[id,visitor,b.requestId])).rows[0];
   if(prior){if(["content","startMinute","location"].some(k=>prior.request[k]!== (input as Record<string,unknown>)[k]))throw new StoreError(409,"同一请求不能改为另一份公告。");
    await c.query("COMMIT");return {world:w,noticeId:prior.id};}
   let data;try{data=validateNotice(input,w);}catch(e){throw new StoreError(400,(e as Error).message);}
   if(w.gatherings.filter(activeGathering).length>=2)throw new StoreError(409,"公告板已有两场待举办聚会，请等活动结束。");
   if(w.gatherings.some(a=>activeGathering(a)&&data.startMinute<a.endMinute&&data.startMinute+60>a.startMinute))throw new StoreError(409,"这个时间已有聚会，请另选时间。");
   const recent=await c.query("SELECT 1 FROM town_notice_owners WHERE world_id=$1 AND visitor_id=$2 AND created_at>clock_timestamp()-interval '60 seconds' LIMIT 1",[id,visitor]);
   if(recent.rows.length)throw new StoreError(429,"刚刚发布过公告，请稍候一分钟再发布。");
   const a:Gathering={id:randomUUID(),worldId:id,kind:"gathering",...data,createdMinute:w.minute,endMinute:data.startMinute+60,status:"scheduled",responses:[]};
   // Only derive a bounded familiarity signal; no private text/name enters the public notice.
   const familiar=await c.query("SELECT npc_id FROM town_private_chats WHERE world_id=$1 AND visitor_id=$2 AND COALESCE((player_memory->>'familiarity')::int,0)>=3",[id,visitor]);
   notifyGathering(w,a,Object.fromEntries(familiar.rows.map(r=>[r.npc_id,true])));
   w.gatherings=[...w.gatherings.filter(g=>activeGathering(g)||w.gatherings!.indexOf(g)>=w.gatherings!.length-29),a];
   await c.query("INSERT INTO town_notice_owners(id,world_id,visitor_id,request_id,request) VALUES($1,$2,$3,$4,$5)",[a.id,id,visitor,b.requestId,JSON.stringify(input)]);
   w.events.push({id:(w.revision+1)*1000+800,minute:w.minute,npcId:w.npcs[0].id,text:"公告板发布了新的广场聚会",reason:"发布者主动公开正文；未附加私人聊天。"});
  }else{
   const a=w.gatherings.find(a=>a.id===b.id);if(!a)throw new StoreError(404,"公告不存在。");
   const own=await c.query("SELECT 1 FROM town_notice_owners WHERE world_id=$1 AND visitor_id=$2 AND id=$3",[id,visitor,a.id]);
   if(!own.rows.length)throw new StoreError(403,"只有发布者可以取消这场聚会。");
   if(a.status==="cancelled"){await c.query("COMMIT");return {world:w,noticeId:a.id};}
   if(a.status==="ended")throw new StoreError(409,"活动已经结束。");
   a.status="cancelled";a.result="发布者取消活动。";
   for(const r of a.responses)if(!["declined","participated"].includes(r.status)){r.status="cancelled";r.reason="公告已取消，已开始的路径安全走完。";r.updatedMinute=w.minute;}
   w.events.push({id:(w.revision+1)*1000+800,minute:w.minute,npcId:w.npcs[0].id,text:"广场聚会已取消",reason:a.result});
  }
  for(const a of w.gatherings)rememberResponses(a);
  w.revision++;w.events=w.events.slice(-100);assertWorld(w);
  await c.query("UPDATE town_worlds SET payload=$2,revision=$3,updated_at=now() WHERE id=$1",[id,JSON.stringify(w),w.revision]);
  await c.query("COMMIT");return {world:w,noticeId:w.gatherings.at(-1)?.id};
 }catch(e){await c.query("ROLLBACK");throw e;}finally{c.release();}
}
// Existing client-controlled avatar: ownership is private, geometry checked against real NPC state.
// Proximity proves an encounter in this demo, not that a conversation or friendship happened.
export async function gatheringPresence(id:string,visitor:string,input:unknown){
 const p=input as Player|null;
 if(p?.sceneId!=="town"||!p.position||!Number.isFinite(p.position.x)||!Number.isFinite(p.position.y)||!canStand("town",p.position))throw new StoreError(400,"请在室外合法位置参加。");
 const c=await database().connect();
 try{
  await c.query("BEGIN");const row=(await c.query("SELECT payload FROM town_worlds WHERE id=$1 FOR UPDATE",[id])).rows[0];if(!row)throw new StoreError(404,"世界不存在。");
  const w=restoreWorld(row.payload);let changed=false;
  const a=w.gatherings?.find(a=>a.status==="active"&&w.minute>=a.startMinute&&w.minute<a.endMinute);
  if(a&&Math.hypot(p.position.x-480,p.position.y-368)<=140){
   for(const n of nearbyResidents(p,w.npcs).filter(n=>a.responses.some(r=>r.npcId===n.id&&r.status==="participated")&&n.sceneId==="town"&&Math.hypot(n.position.x-480,n.position.y-368)<=110)){
    const visit=randomUUID(),created=await c.query("INSERT INTO town_gathering_visits(id,notice_id,visitor_id,npc_id,minute) VALUES($1,$2,$3,$4,$5) ON CONFLICT(notice_id,visitor_id,npc_id) DO NOTHING RETURNING id",[visit,a.id,visitor,n.id,w.minute]);
    if(created.rows.length){if(!changed)w.revision++;changed=true;recordExperience(w,[n.id],"gathering",`public-encounter:${visit}`,`${n.name}在广场聚会现场与一位访客碰面；不代表交谈或好感变化。`);}
   }
  }
  if(changed){assertWorld(w);w.events=w.events.slice(-100);await c.query("UPDATE town_worlds SET payload=$2,revision=$3,updated_at=now() WHERE id=$1",[id,JSON.stringify(w),w.revision]);}
  await c.query("COMMIT");return {world:w};
 }catch(e){await c.query("ROLLBACK");throw e;}finally{c.release();}
}
