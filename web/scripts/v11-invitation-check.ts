import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {mkdir,writeFile} from "node:fs/promises";
import {database,initializeWorld,readWorld,tickWorld,wakeWorld,setWorldRunning,feedWorld,updateWorld} from "../src/lib/store";
import {chat} from "../src/lib/chat-service";
import {privateAppointments} from "../src/lib/invitation-store";
import {assertWorld} from "../src/lib/world";
process.env.AI_ENABLED="false";process.env.NPC_AI_ENABLED="false";process.env.CHAT_REQUESTS_PER_MINUTE="120";
const u=new URL(process.env.DATABASE_URL!);assert.equal(u.hostname,"127.0.0.1");assert.equal(u.port,"55488");assert.equal(u.pathname,"/ai_town_mvp_test");
const id=`v11-invite-${randomUUID()}`,a="a".repeat(64),b="b".repeat(64),dir="evidence/v11/invitation-db",timeline=[];
try{
 await initializeWorld(id);const first=await readWorld(id);const key=randomUUID(),msg="我们一起去咖啡馆吧";
 const turn=await chat("aning",msg,a,id,key);assert.equal(turn.reason,"controlled_action");let w=await readWorld(id);assert.equal(w.npcs[1].appointment?.status,"accepted");
 assert.deepEqual(await chat("aning",msg,a,id,key),turn);assert.equal((await privateAppointments(id,"aning",a)).length,1);
 assert.match((await chat("aning",msg,a,id,randomUUID())).reply,/已经有/);
 assert.equal((await privateAppointments(id,"aning",a))[0].status,"accepted","another refusal must not hide the active commitment");
 await assert.rejects(chat("aning","邀请你去咖啡馆",a,id,key));
 assert.deepEqual(await privateAppointments(id,"aning",b),[]);assert.ok(!JSON.stringify(w).includes(a));assert.ok(!JSON.stringify(w).includes(msg));
 const outsider=await chat("aning",msg,b,id,randomUUID());assert.match(outsider.reply,/已经有/);
 const cantCancel=await chat("aning","取消约定",b,id,randomUUID());assert.match(cantCancel.reply,/没有可以取消/);
 assert.deepEqual(await wakeWorld(id),w); // paused, including appointment and minute
 for(let i=0;i<60&&w.npcs[1].appointment?.status!=="arrived";i++){
  w=await tickWorld(w.revision,id);assertWorld(w);timeline.push({minute:w.minute,scene:w.npcs[1].sceneId,position:w.npcs[1].position,action:w.npcs[1].action,appointment:w.npcs[1].appointment});
 }
 assert.equal(w.npcs[1].sceneId,"cafe_interior");assert.equal((await privateAppointments(id,"aning",a))[0].status,"arrived");
 assert.match((await chat("aning","还记得我们的约定吗",a,id)).reply,/按约到了/);
 assert.ok(!JSON.stringify(w).includes("visitor_id"));
 // Concurrent wake and intervention use the same existing world row lock.
 w=await setWorldRunning(true,w.revision,id);await Promise.allSettled([wakeWorld(id),wakeWorld(id),feedWorld("aning",w.revision,id)]);w=await readWorld(id);assertWorld(w);await setWorldRunning(false,w.revision,id);
 // Persisted rejection/defer use controlled state, no promise/no mutation.
 await updateWorld(id,current=>{const next=structuredClone(current);next.revision++;next.npcs[0].energy=5;return next;});
 assert.match((await chat("aqing",msg,a,id,randomUUID())).reply,/太累/);
 const saved=await readWorld(id);assert.ok(saved.minute>first.minute);
 const worker=saved.npcs.find(n=>n.workTask?.phase==="active")!;assert.ok(worker);
 assert.match((await chat(worker.id,msg,a,id,randomUUID())).reply,/手头/);
 assert.deepEqual(await readWorld(id),saved);
 const cancelId=id+"-cancel";await initializeWorld(cancelId);await chat("aning",msg,a,cancelId,randomUUID());let cancelled=await readWorld(cancelId);cancelled=await tickWorld(cancelled.revision,cancelId);const actionId=cancelled.npcs[1].ongoing!.id;
 await chat("aning","取消约定",a,cancelId,randomUUID());cancelled=await readWorld(cancelId);assert.equal(cancelled.npcs[1].appointment?.status,"cancelled");assert.equal(cancelled.npcs[1].ongoing!.id,actionId);
 cancelled=await tickWorld(cancelled.revision,cancelId);assertWorld(cancelled);assert.equal(cancelled.npcs[1].appointment?.status,"cancelled");
 await mkdir(dir,{recursive:true});await writeFile(`${dir}/result.json`,JSON.stringify({id,checks:["durable accept/idempotency/conflict","privacy and owner cancellation","pause/no offline progress","real road and portal arrival","private result and memory query","concurrent wake/feed","low-energy refusal"],timeline,world:saved,externalCalls:0},null,2));
 console.log("V11.2 PostgreSQL seven checks passed",id);
}finally{await database().end();}
