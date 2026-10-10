// No real-model mode. Network allowlist and test DB identity are mandatory.
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {createServer} from "node:http";
import {mkdir,readFile,writeFile} from "node:fs/promises";
import {database,initializeWorld,readWorld,tickWorld} from "../src/lib/store";
import {chat,chatHistory} from "../src/lib/chat-service";
import {privateConversationState} from "../src/lib/invitation-store";
import type {PlayerRecall} from "../src/lib/chat-facts";
const url=new URL(process.env.DATABASE_URL!);assert.equal(url.hostname,"127.0.0.1");assert.equal(url.port,"55488");assert.equal(url.pathname,"/ai_town_mvp_test");
Object.assign(process.env,{AI_ENABLED:"true",AI_TEST_MODE:"true",AI_API_KEY:"local-only",AI_MODEL:"mock",NPC_AI_ENABLED:"false",CHAT_REQUESTS_PER_MINUTE:"120",AI_CALLS_PER_DAY:"20",AI_TIMEOUT_MS:"1000"});
const run=randomUUID(),id=`v11-5-${run}`,visitor="a".repeat(64),other="b".repeat(64),dir=`evidence/v11-5/${run}`;
let text="是你约我来的，我按约到了。";
const calls:{facts:{importantPlayerEvents:PlayerRecall;currentFacts:unknown;privateAppointments:unknown[]};reply:string}[]=[];
const server=createServer(async(req,res)=>{let raw="";for await(const c of req)raw+=c;const b=JSON.parse(raw);calls.push({facts:JSON.parse(b.messages[0].content.split("世界事实：\n")[1]),reply:text});res.setHeader("content-type","application/json");res.end(JSON.stringify({choices:[{message:{content:text}}]}));});
await new Promise<void>(r=>server.listen(0,"127.0.0.1",r));const address=server.address();assert.ok(address&&typeof address!=="string");process.env.AI_BASE_URL=`http://127.0.0.1:${address.port}/v1`;
const fetchOriginal=globalThis.fetch;globalThis.fetch=(input,init)=>{assert.equal(String(input),`${process.env.AI_BASE_URL}/chat/completions`);assert.ok(calls.length<10);return fetchOriginal(input,init);};
const client=await database().connect();
try{
 // Inspect preserved real evidence and real database rows, without writing to either.
 const prior=JSON.parse(await readFile("evidence/v11-4/real-story-8c70e71e-ca06-43a6-bd79-cfa3e1d4dba3/result.json","utf8"));
 const old=await readWorld(prior.id),oldWork=await readWorld(prior.work);
 const evidence=await privateConversationState(client,prior.id,"aning",visitor,"还记得昨天发生什么吗？");
 const owned=evidence.recall.events;assert.ok(owned.some(e=>e.kind==="arrived"));assert.ok(owned.some(e=>e.kind==="invited"));
 const worker=oldWork.npcs.find(n=>n.id==="laolin")!;assert.equal(worker.workTask?.progress,0);assert.equal(worker.ongoing?.decision.action.kind,"move");
 assert.match(prior.modelCalls[7].generatedReply,/一半/);
 assert.deepEqual((await privateConversationState(client,prior.id,"aning",other,"昨天发生什么？")).recall.events,[]);

 await initializeWorld(id);const accepted=await chat("aning","我们一起去咖啡馆吧",visitor,id,randomUUID());let w=await readWorld(id);
 const appointmentId=w.npcs[1].appointment!.id;
 for(let i=0;i<100&&w.npcs[1].appointment?.status!=="arrived";i++)w=await tickWorld(w.revision,id);
 assert.equal(w.npcs[1].sceneId,"cafe_interior");assert.equal(w.npcs[1].appointment?.status,"arrived");
 const normal=await chat("aning","还记得我们的约定吗？",visitor,id);assert.equal(normal.source,"ai");assert.equal(normal.reply,text);
 assert.deepEqual(calls.at(-1)!.facts.importantPlayerEvents.events.map(e=>[e.kind,e.sourceId,e.turnId]),[["invited",appointmentId,accepted.id],["arrived",appointmentId,accepted.id]]);
 text=prior.modelCalls[4].generatedReply;const denied=await chat("aning","你为什么来这里，我们之前说了什么？",visitor,id);assert.equal(denied.reason,"fact_conflict");assert.equal(denied.factCheck?.originalReply,text);
 // More recent rejected invitations and chatter cannot displace the important completed one.
 for(let i=0;i<10;i++)await chat("aning","我们一起去咖啡馆吧",visitor,id,randomUUID());
 for(let i=0;i<720;i++)w=await tickWorld(w.revision,id);
 process.env.AI_ENABLED="false";for(let i=0;i<21;i++)await chat("aning",`普通闲聊${i}`,visitor,id);process.env.AI_ENABLED="true";
 const snapshot=await privateConversationState(client,id,"aning",visitor,"还记得昨天发生什么吗？");
 assert.ok(!snapshot.appointments.some(a=>a.id===appointmentId));assert.ok(!(await chatHistory("aning",visitor,id)).some(t=>t.id===accepted.id));
 const events=snapshot.recall.events.filter(e=>e.sourceId===appointmentId);assert.equal(snapshot.recall.requestedDay,1);assert.deepEqual(events.map(e=>e.kind),["invited","arrived"]);assert.equal(events[0].turnId,accepted.id);assert.ok(events[0].minute<=events[1].minute);assert.equal(events[1].sourceId,appointmentId);
 text="记得，是你约我去咖啡馆，我按约到过。";const crossDay=await chat("aning","还记得昨天发生什么吗？",visitor,id);assert.equal(crossDay.source,"ai");assert.deepEqual(calls.at(-1)!.facts.importantPlayerEvents,snapshot.recall);
 for(const [npc,who,world] of [["aning",other,id],["aqing",visitor,id],["aning",visitor,prior.side]])assert.deepEqual((await privateConversationState(client,world,npc,who,"昨天发生什么？")).recall.events,[]);
 process.env.AI_API_KEY="";const fallback=await chat("aning","还记得昨天发生什么吗？",visitor,id);assert.equal(fallback.source,"fallback");assert.match(fallback.reply,/你约我/);process.env.AI_API_KEY="local-only";

 const work=id+"-work";await initializeWorld(work);let workWorld=await readWorld(work);workWorld=await tickWorld(workWorld.revision,work);
 text=prior.modelCalls[7].generatedReply;const corrected=await chat("laolin","刚才你为什么没能立即出发？",visitor,work);assert.equal(corrected.reason,"fact_conflict");assert.equal(corrected.factCheck?.originalReply,text);assert.deepEqual(await readWorld(work),workWorld);
 assert.deepEqual((await chatHistory("laolin",other,work)),[]);assert.equal((await chatHistory("laolin",visitor,work)).at(-1)!.factCheck?.originalReply,text);
 assert.deepEqual(await readWorld(prior.id),old);assert.deepEqual(await readWorld(prior.work),oldWork);
 await mkdir(dir,{recursive:true});await writeFile(`${dir}/result.json`,JSON.stringify({id,work,externalCalls:0,localCalls:calls.length,previousEvidence:{worldId:prior.id,minute:old.minute,events:owned,worker,originalReplies:[5,7,8].map(i=>({call:i,reply:prior.modelCalls[i-1].generatedReply})),unchanged:true},accepted,appointmentId,normal,denied,crossDay,fallback,corrected,recall:snapshot.recall,calls,checks:["same snapshot","durable sources and chronological order","important event survives 20 chats and 8 recent invitations","visitor/NPC/world isolation","natural valid reply unchanged","two original hallucinations safely downgraded with raw reply retained","no world mutation or old evidence writes"]},null,2));console.log(JSON.stringify({dir,localCalls:calls.length,externalCalls:0,passed:true}));
}finally{client.release();globalThis.fetch=fetchOriginal;server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));await database().end();}
