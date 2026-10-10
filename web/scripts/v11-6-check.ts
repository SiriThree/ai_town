import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {createServer} from "node:http";
import {mkdir,writeFile} from "node:fs/promises";
import {database,initializeWorld,readWorld,tickWorld,wakeWorld} from "../src/lib/store";
import {chat,chatHistory} from "../src/lib/chat-service";
import {privateAppointments,privateConversationState,recordMeeting} from "../src/lib/invitation-store";
import {assertWorld} from "../src/lib/world";
import {validScenePath} from "../src/lib/scene-data";
const u=new URL(process.env.DATABASE_URL!);assert.equal(u.hostname,"127.0.0.1");assert.equal(u.port,"55488");assert.equal(u.pathname,"/ai_town_mvp_test");
Object.assign(process.env,{AI_ENABLED:"true",AI_TEST_MODE:"true",AI_MODEL:"mock",AI_API_KEY:"local-only",AI_TIMEOUT_MS:"1000",NPC_AI_ENABLED:"false",CHAT_REQUESTS_PER_MINUTE:"120",AI_CALLS_PER_DAY:"25"});
const id=`v11-6-${randomUUID()}`,schedule=id+"-scheduled",missed=id+"-missed",cancelled=id+"-cancel",work=id+"-work",visitor="a".repeat(64),other="b".repeat(64),dir=`evidence/v11-6/${id}`;
const calls:unknown[]=[],timeline:unknown[]=[];let incorrect=false;
const model=createServer(async(req,res)=>{let raw="";for await(const chunk of req)raw+=chunk;const b=JSON.parse(raw),facts=JSON.parse(b.messages.find((m:{content:string})=>m.content.includes("世界事实：\n")).content.split("世界事实：\n")[1]);calls.push(facts);const reply=incorrect?"我不知道你的名字。":facts.playerAcquaintance.name?`记得，你介绍自己叫${facts.playerAcquaintance.name}。`:"你还没告诉我名字呢。";res.setHeader("content-type","application/json");res.end(JSON.stringify({choices:[{message:{content:b.response_format?JSON.stringify({kind:"chat",reply}):reply}}]}));});
await new Promise<void>(r=>model.listen(0,"127.0.0.1",r));const address=model.address();assert.ok(address&&typeof address!=="string");process.env.AI_BASE_URL=`http://127.0.0.1:${address.port}/v1`;
const originalFetch=globalThis.fetch;globalThis.fetch=(input,init)=>{assert.equal(String(input),`${process.env.AI_BASE_URL}/chat/completions`);return originalFetch(input,init);};
const memory=async(world=id,who=visitor)=>(await database().query("SELECT player_memory FROM town_private_chats WHERE world_id=$1 AND npc_id='xiaoman' AND visitor_id=$2",[world,who])).rows[0]?.player_memory;
async function step(world:string){const w=await readWorld(world),next=await tickWorld(w.revision,world);assertWorld(next);for(const n of next.npcs)if(n.lastPath.length)assert.ok(validScenePath(n.sceneId,n.lastPath));return next;}
async function plan(world:string){await initializeWorld(world);const initial=await readWorld(world);const proposal=await chat("xiaoman","待会你有空吗？我想邀请你去咖啡馆喝杯咖啡。",visitor,world,randomUUID());let a=(await privateAppointments(world,"xiaoman",visitor))[0];assert.equal(a.status,"proposed");assert.deepEqual(await readWorld(world),initial);
 assert.deepEqual(await chat("xiaoman","待会你有空吗？我想邀请你去咖啡馆喝杯咖啡。",visitor,world,randomUUID()),proposal);
 const request=randomUUID(),confirmed=await chat("xiaoman","好的",visitor,world,request);assert.deepEqual(await chat("xiaoman","好的",visitor,world,request),confirmed);
 a=(await privateAppointments(world,"xiaoman",visitor))[0];assert.equal(a.status,"accepted");assert.equal((await privateAppointments(world,"xiaoman",visitor)).length,1);assert.ok(a.scheduledMinute!>initial.minute);assert.equal((await readWorld(world)).npcs.find(n=>n.id==="xiaoman")!.appointment!.id,a.id);
 assert.deepEqual(await wakeWorld(world),await readWorld(world));timeline.push({world,proposal,confirmed,appointment:a});return a;
}
try{
 await initializeWorld(id);const introduction=await chat("xiaoman","我叫 three，你记住了吗？",visitor,id);assert.match(introduction.reply,/three/);assert.equal((await memory()).nameFact.turnId,introduction.id);
 const originalName=(await memory()).nameFact;assert.match((await chat("xiaoman","我叫什么名字？",visitor,id)).reply,/three/);
 const scenes=new Set<string>();for(let i=0;i<720;i++){const w=await step(id);scenes.add(w.npcs.find(n=>n.id==="xiaoman")!.sceneId);}assert.ok(scenes.size>1);
 process.env.AI_ENABLED="false";for(let i=0;i<21;i++)await chat("xiaoman",`闲聊${i}`,visitor,id);process.env.AI_ENABLED="true";
 assert.ok(!(await chatHistory("xiaoman",visitor,id)).some(t=>t.id===introduction.id));assert.deepEqual((await memory()).nameFact,originalName);
 assert.match((await chat("xiaoman","你还认识我吗？",visitor,id)).reply,/three/);incorrect=true;const protectedName=await chat("xiaoman","我叫什么名字？",visitor,id);assert.match(protectedName.reply,/three/);assert.equal(protectedName.reason,"fact_conflict");incorrect=false;
 await chat("xiaoman","以后请叫我 four",visitor,id);assert.match((await chat("xiaoman","我叫什么名字？",visitor,id)).reply,/four/);assert.equal((await memory()).trust,0);assert.equal((await memory()).affection,0);
 const stranger=await chat("xiaoman","我叫什么名字？",other,id);assert.ok(!/three|four/.test(stranger.reply));assert.equal((await memory(id,other)).name,undefined);
 process.env.AI_ENABLED="false";
 const a=await plan(schedule);assert.equal((await recordMeeting(schedule,"xiaoman",visitor,{sceneId:"cafe_interior",position:{x:500,y:450}})).meeting,null);
 let arrival=await readWorld(schedule),start:number|undefined;for(let i=0;i<150;i++){arrival=await step(schedule);const n=arrival.npcs.find(n=>n.id==="xiaoman")!;if(n.appointment!.status==="travelling")start??=arrival.minute;if(n.appointment!.status==="arrived")break;}
 const n=arrival.npcs.find(n=>n.id==="xiaoman")!;assert.equal(n.appointment!.status,"arrived");assert.ok(start!<a.scheduledMinute!);assert.ok(Math.abs(arrival.minute-a.scheduledMinute!)<=6);assert.equal(n.appointment!.metMinute,undefined);
 const presence={sceneId:"cafe_interior",position:n.position};assert.equal((await recordMeeting(schedule,n.id,other,presence)).meeting,null);
 await assert.rejects(recordMeeting(schedule,n.id,visitor,{...presence,sceneId:"town"}));await assert.rejects(recordMeeting(schedule,n.id,visitor,{...presence,position:{x:180,y:450}}));
 const met=await recordMeeting(schedule,n.id,visitor,presence);assert.equal(met.meeting?.status,"met");const after=await readWorld(schedule);assert.deepEqual(await recordMeeting(schedule,n.id,visitor,presence),met);assert.deepEqual(await readWorld(schedule),after);
 const recalled=await chat(n.id,"还记得我们的约定吗？",visitor,schedule);assert.match(recalled.reply,/见面/);
 const client=await database().connect();try{const snapshot=await privateConversationState(client,schedule,n.id,visitor,"还记得我们的约定吗？");assert.ok(snapshot.recall.events.some(e=>e.kind==="met"&&e.minute===arrival.minute&&e.sourceId===a.id));assert.deepEqual((await privateConversationState(client,schedule,n.id,other,"记得吗")).recall.events,[]);}finally{client.release();}
 timeline.push({world:schedule,departure:start,arrivalMinute:arrival.minute,scheduledMinute:a.scheduledMinute,met,recalled});
 await plan(missed);let late=await readWorld(missed);for(let i=0;i<200;i++){late=await step(missed);if(late.npcs.find(n=>n.id==="xiaoman")!.appointment!.status==="missed")break;}assert.equal(late.npcs.find(n=>n.id==="xiaoman")!.appointment!.status,"missed");timeline.push({world:missed,appointment:late.npcs.find(n=>n.id==="xiaoman")!.appointment});
 await plan(cancelled);let cw=await readWorld(cancelled);for(let i=0;i<100;i++){cw=await step(cancelled);if(cw.npcs.find(n=>n.id==="xiaoman")!.ongoing?.path.length)break;}const movement=cw.npcs.find(n=>n.id==="xiaoman")!.ongoing!.id;
 await chat("xiaoman","取消约定",visitor,cancelled,randomUUID());assert.equal((await readWorld(cancelled)).npcs.find(n=>n.id==="xiaoman")!.ongoing!.id,movement);assert.equal((await readWorld(cancelled)).npcs.find(n=>n.id==="xiaoman")!.appointment!.status,"cancelled");
 await initializeWorld(work);await step(work);await chat("laolin","那我们现在就去咖啡馆可以吗？",visitor,work,randomUUID());assert.equal((await privateAppointments(work,"laolin",visitor))[0].status,"deferred");assert.equal((await readWorld(work)).npcs.find(n=>n.id==="laolin")!.workTask!.progress,0);
 await mkdir(dir,{recursive:true});await writeFile(`${dir}/result.json`,JSON.stringify({id,extraIds:[schedule,missed,cancelled,work],externalCalls:0,localCalls:calls.length,introduction,protectedName,memory:await memory(),scenes:[...scenes],timeline,modelFacts:calls,checks:["explicit name source and correction","real scene changes and one-day advancement","20-turn history rollover","owner isolation","proposal is not commitment","confirm dedup and same appointment ID","path-timed arrival","pause and cancellation preserve actions","actual proximity meeting distinct from arrival","late visitor ends waiting","work conflict defers"]},null,2));console.log(JSON.stringify({dir,passed:true,externalCalls:0}));
}finally{globalThis.fetch=originalFetch;model.closeAllConnections();await new Promise<void>(r=>model.close(()=>r()));await database().end();}
