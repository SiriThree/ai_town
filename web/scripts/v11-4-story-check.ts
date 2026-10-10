// Default is isolated loopback Mock. --real-approved is ONLY for a separately authorized run.
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {createServer} from "node:http";
import {mkdir,writeFile} from "node:fs/promises";
import {database,initializeWorld,readWorld,tickWorld,wakeWorld,updateWorld} from "../src/lib/store";
import {chat,chatHistory} from "../src/lib/chat-service";
import {privateAppointments} from "../src/lib/invitation-store";
import {assertWorld,type World} from "../src/lib/world";
import {validScenePath} from "../src/lib/scene-data";
import {aiConfig} from "../src/lib/chat-model";
const u=new URL(process.env.DATABASE_URL!);assert.equal(u.hostname,"127.0.0.1");assert.equal(u.port,"55488");assert.equal(u.pathname,"/ai_town_mvp_test");
const real=process.argv.includes("--real-approved"),run=randomUUID(),dir=`evidence/v11-4/${real?"real":"mock"}-story-${run}`;
Object.assign(process.env,{NPC_AI_ENABLED:"false",CHAT_REQUESTS_PER_MINUTE:"120",AI_CALLS_PER_DAY:"8"});
let mode="normal";const provider=createServer(async(req,res)=>{
 let raw="";for await(const c of req)raw+=c;const body=JSON.parse(raw),f=JSON.parse(body.messages[0].content.split("世界事实：\n")[1]);
 if(mode==="failure"){res.writeHead(503);res.end("{}");return;}
 if(mode==="timeout"){setTimeout(()=>res.end("{}"),2000).unref();return;}
 const m=f.playerAcquaintance,a=f.privateAppointments[0],question=body.messages.at(-1).content;
 let reply=m.first?`记得，第${Math.floor(m.first.minute/1440)+1}天我们聊过，你还没说称呼。`:"我们还没有交谈记录，我不知道你的称呼。";
 if(!/记得|认识|你好/.test(question)&&a)reply=a.status==="arrived"?"之前按你的邀请到了咖啡馆。":a.status==="cancelled"?"会合已经取消，不再履行这次约定。":a.status==="deferred"?"我还在忙工作，忙完后请再约我。":"我正按约去咖啡馆，还没有到。";
 res.setHeader("content-type","application/json");res.end(JSON.stringify({choices:[{message:{content:reply}}],usage:{prompt_tokens:100,completion_tokens:20,total_tokens:120}}));
});
if(real){
 const c=aiConfig();assert.ok(c.enabled&&c.key&&c.model==="qwen-plus"&&!c.testMode);assert.equal(new URL(c.baseUrl).protocol,"https:");
}else{
 await new Promise<void>(r=>provider.listen(0,"127.0.0.1",r));const address=provider.address();assert.ok(address&&typeof address!=="string");
 Object.assign(process.env,{AI_ENABLED:"true",AI_TEST_MODE:"true",AI_API_KEY:"local-only",AI_MODEL:"mock",AI_BASE_URL:`http://127.0.0.1:${address.port}/v1`,AI_TIMEOUT_MS:"150"});
}
const config=aiConfig(),endpoint=config.baseUrl.replace(/\/+$/,"")+"/chat/completions",originalFetch=globalThis.fetch;
const modelCalls:Record<string,unknown>[]=[],timeline:Record<string,unknown>[]=[],checks:string[]=[];
await mkdir(dir,{recursive:true});
globalThis.fetch=async(input,init)=>{
 assert.equal(String(input),endpoint,"unexpected outbound destination blocked");assert.ok(modelCalls.length<(real?8:10),"run-wide call ceiling, including failures and worlds");
 const body=JSON.parse(String(init?.body));assert.ok(JSON.stringify(body.messages).length<=24000,"input text ceiling");
 const record:Record<string,unknown>={number:modelCalls.length+1,at:new Date().toISOString(),model:body.model,messages:body.messages,maxOutputTokens:body.max_completion_tokens};modelCalls.push(record);
 await writeFile(`${dir}/call-ledger.json`,JSON.stringify({real,modelCalls},null,2));
 try{const response=await originalFetch(input,init);record.httpStatus=response.status;
  if(response.ok){const result=await response.clone().json();record.generatedReply=result.choices?.[0]?.message?.content;record.usage=result.usage??null;}
  return response;
 }catch(error){record.transport="failed_or_aborted";throw error;}
 finally{await writeFile(`${dir}/call-ledger.json`,JSON.stringify({real,modelCalls},null,2));}
};
const id=`v11-4-story-${run}`,visitor="a".repeat(64),other="b".repeat(64),side=id+"-cancel",work=id+"-work";
async function say(label:string,message:string,world=id,npc="aning",who=visitor,requestId?:string){
 const callsBefore=modelCalls.length,turn=await chat(npc,message,who,world,requestId),w=await readWorld(world);
 const memory=(await database().query("SELECT player_memory FROM town_private_chats WHERE world_id=$1 AND npc_id=$2 AND visitor_id=$3",[world,npc,who])).rows[0]?.player_memory;
 timeline.push({label,world,visitor:who===visitor?"A":"B",turn,modelCallNumbers:modelCalls.slice(callsBefore).map(r=>r.number),worldMinute:w.minute,npc:w.npcs.find(n=>n.id===npc),privateAppointments:await privateAppointments(world,npc,who),memory,events:w.events.slice(-8)});
 return turn;
}
async function step(w:World,world=id){const n=await tickWorld(w.revision,world);assertWorld(n);for(const npc of n.npcs)if(npc.lastPath.length)assert.ok(validScenePath(npc.sceneId,npc.lastPath));return n;}
try{
 await initializeWorld(id);await say("A1 初识，无自报名", "你好，我们以前认识吗？");await say("A2 再次认识", "你还记得我吗？");await say("A3 独立访客", "你还记得我吗？",id,"aning",other);
 const before=await readWorld(id),request=randomUUID();const accepted=await say("B1 后台确认邀请","我们一起去咖啡馆吧",id,"aning",visitor,request);
 assert.equal(accepted.reason,"controlled_action");assert.equal((await readWorld(id)).npcs[1].appointment?.status,"accepted");
 assert.deepEqual(await chat("aning","我们一起去咖啡馆吧",visitor,id,request),accepted);assert.equal((await privateAppointments(id,"aning",visitor)).length,1);
 assert.deepEqual(await privateAppointments(id,"aning",other),[]);assert.equal((await chatHistory("aning",other,id)).length,1);
 let w=await readWorld(id);assert.deepEqual(await wakeWorld(id),w);w=await step(w);assert.equal(w.npcs[1].appointment?.status,"travelling");
 await say("B2 途中模型说明","你现在朝哪里走，为什么？");
 const route=[];for(let i=0;i<100&&w.npcs[1].appointment?.status!=="arrived";i++){w=await step(w);route.push({minute:w.minute,npc:w.npcs[1]});}
 assert.equal(w.npcs[1].sceneId,"cafe_interior");assert.equal((await privateAppointments(id,"aning",visitor))[0].status,"arrived");
 timeline.push({label:"B3 合法真实路线与入口",route});await say("B4 到达原因与经历（模型回答）","你为什么来这里，我们之前说了什么？");
 checks.push("A owner-scoped facts, no assumed name; B durable/idempotent acceptance, pause, legal paths and actual portal arrival");
 await initializeWorld(side);await chat("aning","我们一起去咖啡馆吧",visitor,side,randomUUID());let cancelled=await step(await readWorld(side),side);const actionId=cancelled.npcs[1].ongoing?.id;
 await say("D1 取消确认","取消约定",side);cancelled=await step(await readWorld(side),side);assert.equal(cancelled.npcs[1].appointment?.status,"cancelled");assert.equal(cancelled.npcs[1].ongoing?.id,actionId);
 await say("D2 取消后模型说明","请说明我们现在还需要会合吗？",side);
 // Genuine rule-driven passage of one day, with real transaction persistence every step.
 const startMinute=w.minute;for(let i=0;i<720;i++)w=await step(w);
 assert.equal(w.minute,startMinute+1440);assert.equal(w.npcs[1].appointment?.status,"arrived");
 assert.equal((await privateAppointments(id,"aning",visitor)).filter(a=>a.status==="arrived").length,1);
 process.env.AI_ENABLED="false";for(let i=0;i<21;i++)await chat("aning",`闲聊记录${i}`,visitor,id);process.env.AI_ENABLED="true";
 assert.ok(!(await chatHistory("aning",visitor,id)).some(t=>t.message==="你还记得我吗？"));
 await say("E 跨天且早期聊天已移出20轮窗口","你还记得我吗？请说一件真实经历。");
 await initializeWorld(work);const working=await step(await readWorld(work),work);const worker=working.npcs.find(n=>n.id==="laolin")!;assert.equal(worker.workTask?.phase,"active");
 await say("C1 工作冲突后台推迟","我们一起去咖啡馆吧",work,worker.id);assert.equal((await privateAppointments(work,worker.id,visitor))[0].status,"deferred");
 await say("C2 工作冲突模型说明","刚才你为什么没能立即出发？",work,worker.id);assert.deepEqual(await readWorld(work),working);
 checks.push("C work defers without world mutation; D cancellation preserves active movement; E 720 real steps and bounded-history rollover retain sourced first encounter/appointment; no duplicate execution");
 if(!real){
  for(const fault of ["failure","timeout"]){mode=fault;const turn=await say(`D ${fault}`,"你还记得我吗？",side);assert.equal(turn.source,"fallback");assert.equal(turn.reason,fault==="timeout"?"timeout":"service_error");}mode="normal";
  const savedKey=process.env.AI_API_KEY;process.env.AI_API_KEY="";assert.equal((await say("D 无密钥","你还记得我吗？",side)).reason,"not_configured");process.env.AI_API_KEY=savedKey;
  // Controlled high-priority need interruption, then unmodified rules must resume or explain failure.
  const interrupted=id+"-interrupted";await initializeWorld(interrupted);await chat("aning","我们一起去咖啡馆吧",visitor,interrupted,randomUUID());
  let iw=await updateWorld(interrupted,current=>{const next=structuredClone(current);next.revision++;next.npcs[1].energy=12;return next;});iw=await step(iw,interrupted);assert.equal(iw.npcs[1].appointment?.status,"waiting");
  const stages:(string|undefined)[]=[iw.npcs[1].appointment?.status];for(let i=0;i<180&&iw.npcs[1].appointment?.status!=="arrived";i++){iw=await step(iw,interrupted);stages.push(iw.npcs[1].appointment?.status);}
  assert.equal(iw.npcs[1].appointment?.status,"arrived");timeline.push({label:"D 紧急精力恢复后继续履約",stages,npc:iw.npcs[1]});
  checks.push("D real network 503/abort timeout/no key fallback; need interruption resumes via existing decisions");
 }
 const freshFacts=JSON.parse((modelCalls[2].messages as {content:string}[])[0].content.split("世界事实：\n")[1]);assert.equal(freshFacts.playerAcquaintance.meetings,0);assert.deepEqual(freshFacts.privateAppointments,[]);
 assert.equal(modelCalls.length,real?8:10);assert.ok((await readWorld(id)).minute>before.minute);
 if(!real)for(const call of modelCalls.slice(0,8))assert.ok(String(call.generatedReply).length<=30);
 await mkdir(dir,{recursive:true});await writeFile(`${dir}/result.json`,JSON.stringify({id,side,work,real,model:config.model,providerHost:new URL(config.baseUrl).host,checks,timeline,modelCalls,externalCalls:real?modelCalls.length:0,cost:real?"Provider billing not available; actual usage recorded per response. Manual language review required.":0},null,2));
 console.log(JSON.stringify({dir,checks,calls:modelCalls.length,externalCalls:real?modelCalls.length:0}));
}catch(error){await mkdir(dir,{recursive:true});await writeFile(`${dir}/failure.json`,JSON.stringify({id,real,checks,timeline,modelCalls,errorType:error instanceof Error?error.name:"unknown"},null,2));throw error;}
finally{globalThis.fetch=originalFetch;if(!real){provider.closeAllConnections();await new Promise<void>(r=>provider.close(()=>r()));}await database().end();}


