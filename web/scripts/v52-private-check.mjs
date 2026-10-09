import assert from "node:assert/strict";
import {spawn} from "node:child_process";
import {randomUUID} from "node:crypto";
import {createServer} from "node:http";
import {createWriteStream} from "node:fs";
import {mkdir,writeFile} from "node:fs/promises";
import path from "node:path";
import {database,initializeWorld,readWorld} from "../src/lib/store.ts";
if(new URL(process.env.DATABASE_URL||"").pathname!=="/ai_town_mvp_test")throw new Error("仅允许专用测试库");
const id=`private-${randomUUID()}`,base="http://127.0.0.1:3109",dir=process.env.EVIDENCE_DIR||"evidence/v5-2/private";
await mkdir(dir,{recursive:true});const log=createWriteStream(`${dir}/server.log`,{flags:"a"});
const contexts=[],checks=[],errors=[],modelContexts=[];let server,browser,failed=false;
const stub=createServer(async(req,res)=>{let raw="";for await(const chunk of req)raw+=chunk;const body=JSON.parse(raw);modelContexts.push(body.messages);await new Promise(r=>setTimeout(r,80));res.setHeader("Content-Type","application/json");if(failed){res.writeHead(503);res.end("private service failure");return;}res.end(JSON.stringify({choices:[{message:{content:`本地替身回答：${body.messages.at(-1).content}`}}]}));});
await new Promise(r=>stub.listen(0,"127.0.0.1",r));
async function start(secret="test-cookie-signing-secret-v52-do-not-deploy"){
  server=spawn(process.execPath,["node_modules/next/dist/bin/next","start","--hostname","127.0.0.1","--port","3109"],{windowsHide:true,stdio:["ignore","pipe","pipe"],env:{...process.env,WORLD_ID:id,PUBLIC_DEMO:"true",COOKIE_SIGNING_SECRET:secret,AI_ENABLED:"true",AI_API_KEY:"v52-loopback-not-real",AI_BASE_URL:`http://127.0.0.1:${stub.address().port}/v1`,AI_MODEL:"stub",AI_TEST_MODE:"true",AI_CALLS_PER_DAY:"3",CHAT_REQUESTS_PER_MINUTE:"30"}});
  server.stdout.pipe(log,{end:false});server.stderr.pipe(log,{end:false});
  for(let i=0;i<150;i++){if(server.exitCode!==null)throw new Error("server exited");try{if((await fetch(base+"/api/world")).ok)return;}catch{}await new Promise(r=>setTimeout(r,100));}throw new Error("start timeout");
}
async function stop(){if(server?.exitCode===null)await new Promise(r=>{server.once("exit",r);server.kill();});}
async function history(context,npc="aqing",query=""){const r=await context.request.get(`${base}/api/npcs/${npc}/chat${query}`);assert.equal(r.status(),200);return(await r.json()).turns;}
async function send(page,message){const r=page.waitForResponse(r=>r.url().endsWith("/aqing/chat")&&r.request().method()==="POST");await page.getByRole("textbox").fill(message);await page.getByRole("textbox").press("Enter");const response=await r;assert.equal(response.status(),200);return response.json();}
try{
  await initializeWorld(id);const initial=await readWorld(id);
  const legacy=[{id:"old",message:"LEGACY_SHARED_PRIVATE",reply:"legacy",source:"fallback",minute:480,worldRevision:0,createdAt:"old"}];
  await database().query("INSERT INTO town_chats(world_id,npc_id,turns) VALUES($1,'aqing',$2)",[id,JSON.stringify(legacy)]);
  await start();process.env.PLAYWRIGHT_BROWSERS_PATH=path.resolve(".browsers");const {chromium,expect}=await import("@playwright/test");browser=await chromium.launch({headless:true});
  for(let i=0;i<2;i++){const c=await browser.newContext({viewport:{width:1440,height:900}});contexts.push(c);}
  const [a,b]=await Promise.all(contexts.map(c=>c.newPage()));
  for(const p of [a,b]){p.on("pageerror",e=>errors.push(e.message));await p.goto(base+"/?npc=aqing");await expect(p.getByRole("textbox")).toBeEnabled();}
  assert.equal((await history(contexts[0])).length,0);assert.equal((await history(contexts[1])).length,0);
  const cookieA=(await contexts[0].cookies()).find(c=>c.name==="__Host-town_session"),cookieB=(await contexts[1].cookies()).find(c=>c.name==="__Host-town_session");
  assert.ok(cookieA&&cookieB);assert.notEqual(cookieA.value,cookieB.value);assert.equal(cookieA.secure,true);assert.equal(cookieA.httpOnly,true);assert.equal(cookieA.sameSite,"Strict");
  assert.ok(!(await a.evaluate(()=>document.cookie)).includes("town_session"));
  checks.push("独立浏览器签发不同Secure/HttpOnly/SameSite Strict签名Cookie；旧共享记录不自动归属/公开");
  await send(a,"PRIVATE_A_MARKER 你现在在哪？");assert.equal((await history(contexts[1])).length,0);
  await a.screenshot({path:`${dir}/01-visitor-a.png`,fullPage:true});
  await send(b,"PRIVATE_B_MARKER 你喜欢什么？");
  assert.ok(!JSON.stringify(modelContexts.at(-1)).includes("PRIVATE_A_MARKER"));
  const bHistory=await history(contexts[1],"aqing",`?visitorId=${cookieA.value.split(".")[0]}`);assert.equal(bHistory.length,1);assert.ok(!JSON.stringify(bHistory).includes("PRIVATE_A_MARKER"));
  assert.equal((await history(contexts[0],"aning")).length,0);
  await b.screenshot({path:`${dir}/02-visitor-b.png`,fullPage:true});
  assert.deepEqual(await readWorld(id),initial);assert.ok(!JSON.stringify(await readWorld(id)).includes("PRIVATE_"));
  checks.push("两访客历史/模型上下文隔离，伪造查询归属无效；居民隔离，世界/事件不含私聊");
  const endpoint=base+"/api/npcs/aqing/chat",body=JSON.stringify({message:"illegal"});
  assert.equal((await fetch(endpoint,{method:"POST",body})).status,401);
  const tampered=cookieA.value.slice(0,-1)+(cookieA.value.endsWith("A")?"B":"A");
  assert.equal((await fetch(endpoint,{method:"POST",headers:{cookie:`__Host-town_session=${tampered}`},body})).status,401);
  const tamperedGet=await(await fetch(endpoint,{headers:{cookie:`__Host-town_session=${tampered}`}})).json();assert.deepEqual(tamperedGet.turns,[]);
  assert.equal((await contexts[0].request.post(endpoint,{headers:{origin:"https://evil.invalid"},data:{message:"x"}})).status(),403);
  assert.equal((await fetch(base+"/api/world/init",{method:"POST"})).status,403);
  assert.equal(modelContexts.length,2);checks.push("无会话/篡改签名POST401、跨站403、生产初始化403，均不调用模型");
  failed=true;assert.equal((await send(a,"模型故障验证")).reason,"service_error");
  assert.equal(modelContexts.length,3);
  const beforeA=await history(contexts[0]),beforeB=await history(contexts[1]);
  await stop();await start();assert.deepEqual(await history(contexts[0]),beforeA);assert.deepEqual(await history(contexts[1]),beforeB);
  await a.reload();await expect(a.getByRole("textbox")).toBeEnabled();
  assert.equal((await send(a,"你现在在干什么？")).reason,"budget_exhausted");assert.equal(modelContexts.length,3);
  checks.push("故障Fallback、服务重启私聊恢复；两访客共享3次模型预算，重启不清零且无第四次调用");
  await a.getByRole("button",{name:"开始自动运行"}).click();await expect(b.getByTestId("run-status")).toContainText("自动运行");
  await expect.poll(async()=>(await readWorld(id)).minute,{timeout:8500}).toBe(490);
  const pauseResponse=b.waitForResponse(r=>r.url().endsWith("/api/world/run")&&r.request().method()==="POST");
  await b.getByRole("button",{name:"暂停自动运行"}).click();assert.equal((await pauseResponse).status(),200);
  await expect(b.getByTestId("run-status")).toContainText("已暂停");const paused=await readWorld(id);assert.equal(paused.run.running,false);
  await new Promise(r=>setTimeout(r,5500));assert.deepEqual(await readWorld(id),paused);
  assert.ok(!JSON.stringify(paused.events).includes("PRIVATE_"));checks.push("两个独立访客同一自动时刻只推进一次；另一访客暂停有效，公开事件无私聊内容");
  await stop();await start("");assert.equal((await fetch(base+"/api/health")).status,503);assert.equal((await fetch(endpoint)).status,503);
  assert.deepEqual((await database().query("SELECT turns FROM town_chats WHERE world_id=$1 AND npc_id='aqing'",[id])).rows[0].turns,legacy);
  assert.equal(errors.length,0);checks.push("生产签名密钥缺失时健康/聊天失败关闭；旧共享记录完整保留");
  await writeFile(`${dir}/result.json`,JSON.stringify({date:new Date().toISOString(),worldId:id,checks,errors,modelCallsToLoopback:modelContexts.length,externalModelCalls:0,cookieValuesRecorded:false},null,2));console.log(`${checks.length} private-session browser/API groups passed; external model calls 0`);
}finally{await browser?.close();await stop();stub.closeAllConnections();await new Promise(r=>stub.close(r));log.end();await database().end();}
