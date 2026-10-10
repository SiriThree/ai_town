import {randomUUID} from "node:crypto";
import {database,readWorld,StoreError} from "./store";
import {assertWorld,restoreWorld} from "./world";
import {activeGathering,validateNotice,type Gathering} from "./gatherings";

export async function notices(id:string,visitor:string){
 const w=await readWorld(id),owned=await database().query("SELECT id FROM town_notice_owners WHERE world_id=$1 AND visitor_id=$2",[id,visitor]);
 return {world:w,ownedIds:owned.rows.map(r=>r.id as string)};
}
export async function changeNotice(id:string,visitor:string,input:unknown){
 const b=input as {action?:unknown;requestId?:unknown;id?:unknown}|null;
 if(!b||!["publish","cancel"].includes(String(b.action)))throw new StoreError(400,"公告操作无效。");
 if(typeof b.requestId!=="string"||!/^[-a-f0-9]{36}$/i.test(b.requestId))throw new StoreError(400,"请求编号无效。");
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
   w.gatherings=[...w.gatherings,a];
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
  w.revision++;w.events=w.events.slice(-100);assertWorld(w);
  await c.query("UPDATE town_worlds SET payload=$2,revision=$3,updated_at=now() WHERE id=$1",[id,JSON.stringify(w),w.revision]);
  await c.query("COMMIT");return {world:w,noticeId:w.gatherings.at(-1)?.id};
 }catch(e){await c.query("ROLLBACK");throw e;}finally{c.release();}
}
