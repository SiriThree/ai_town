import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { createWriteStream } from "node:fs";
import { mkdir,writeFile } from "node:fs/promises";
import path from "node:path";
process.env.PLAYWRIGHT_BROWSERS_PATH=path.resolve(".browsers");
const {chromium,expect}=await import("@playwright/test");
if(new URL(process.env.DATABASE_URL||"").pathname!=="/ai_town_mvp_test")throw new Error("仅允许本项目测试库");
const dir=process.env.EVIDENCE_DIR || "evidence/scene-chat/chat-regression", base="http://127.0.0.1:3102", worldId=`chat-${randomUUID()}`;
await mkdir(dir,{recursive:true});
const log=createWriteStream(`${dir}/server.log`,{flags:"a"});
let server,browser,page;
const captures=[],checks=[],pids=[],pageErrors=[];
const dummyKey="chat-check-not-a-real-key";
const stub=createServer(async(req,res)=>{
  assert.equal(req.url,"/v1/chat/completions");
  let raw="";for await(const part of req)raw+=part;
  const body=JSON.parse(raw);
  captures.push({messages:body.messages,model:body.model,hasExpectedAuthorization:req.headers.authorization===`Bearer ${dummyKey}`});
  const text=body.messages.at(-1).content;
  if(text==="__network__"){req.socket.destroy();return;}
  if(text==="__error__"){res.writeHead(503);res.end("private provider error must not reach browser");return;}
  if(text==="__empty__"){res.setHeader("Content-Type","application/json");res.end(JSON.stringify({choices:[{message:{content:""}}]}));return;}
  await new Promise(resolve=>setTimeout(resolve,text==="__timeout__"?1200:120));
  if(res.destroyed)return;
  const facts=JSON.parse(body.messages[0].content.split("世界事实：\n")[1]);
  res.setHeader("Content-Type","application/json");
  res.end(JSON.stringify({choices:[{message:{content:text==="__long__"?"[本地测试替身] "+"长回复仅用于验证展开全文，不能被当成真实模型调用。".repeat(25):`[本地测试替身] 我是${facts.name}，现在在${facts.location}，正在「${facts.action}」。这是一条适配器成功路径的测试回复。`}}]}));
});
await new Promise(resolve=>stub.listen(0,"127.0.0.1",resolve));
const stubUrl=`http://127.0.0.1:${stub.address().port}/v1`;
async function start(enabled=false){
  server=spawn(process.execPath,["node_modules/next/dist/bin/next","start","--hostname","127.0.0.1","--port","3102"],{
    windowsHide:true,stdio:["ignore","pipe","pipe"],env:{...process.env,WORLD_ID:worldId,NEXT_TELEMETRY_DISABLED:"1",AI_ENABLED:enabled?"true":"false",AI_API_KEY:enabled?dummyKey:"",AI_BASE_URL:enabled?stubUrl:"",AI_MODEL:enabled?"local-stub":"",AI_TEST_MODE:enabled?"true":"false",AI_TIMEOUT_MS:"500"},
  });
  pids.push(server.pid);server.stdout.pipe(log,{end:false});server.stderr.pipe(log,{end:false});
  for(let i=0;i<100;i++){
    if(server.exitCode!==null)throw new Error("测试服务退出");
    try{const r=await fetch(`${base}/api/world`);if(r.ok||r.status===404)return;}catch{}
    await new Promise(resolve=>setTimeout(resolve,100));
  }throw new Error("启动超时");
}
async function stop(){if(!server||server.exitCode!==null)return;await new Promise((resolve,reject)=>{const t=setTimeout(()=>reject(new Error("测试服务未退出")),10000);server.once("exit",()=>{clearTimeout(t);resolve();});server.kill();});}
async function world(){const r=await fetch(`${base}/api/world`);assert.equal(r.status,200);return r.json();}
async function post(npc,message){const r=await fetch(`${base}/api/npcs/${npc}/chat`,{method:"POST",headers:{"Content-Type":"application/json",cookie:(await page.context().cookies(base)).map(c=>`${c.name}=${c.value}`).join("; ")},body:JSON.stringify({message})});return {status:r.status,data:await r.json()};}
async function history(npc){const r=await fetch(`${base}/api/npcs/${npc}/chat`,{headers:{cookie:(await page.context().cookies(base)).map(c=>`${c.name}=${c.value}`).join("; ")}});assert.equal(r.status,200);return (await r.json()).turns;}
async function openChat(npc){await page.getByTestId(`npc-${npc}`).click();await expect(page.getByRole("textbox")).toBeEnabled();}
async function sendUI(message){await page.getByRole("textbox").fill(message);await page.getByRole("button",{name:"发送消息"}).click();await expect(page.getByRole("textbox")).toHaveValue("");}
try{
  await start();
  browser=await chromium.launch({headless:true});page=await browser.newPage({viewport:{width:1440,height:1050}});
  page.on("pageerror",e=>pageErrors.push(e.message));
  await page.goto(base);await expect(page.getByTestId("scene-canvas")).toHaveAttribute("data-ready","true");
  const initial=await world();
  await openChat("aqing");
  await page.screenshot({path:`${dir}/01-chat-window.png`,fullPage:true});
  await page.getByRole("textbox").click();
  assert.deepEqual(await world(),initial);await expect(page.getByTestId("scene-composer")).toBeVisible();
  await page.getByRole("textbox").fill("你现在在干什么？");
  await page.getByRole("textbox").press("Enter");
  await expect(page.getByTestId("reply-source").last()).toHaveText("降级回复 · 未配置模型");
  await expect(page.getByTestId("chat-reply").last()).toContainText(initial.npcs[0].action);
  await page.screenshot({path:`${dir}/02-fallback-no-key.png`,fullPage:true});
  await sendUI("你喜欢什么？");await expect(page.getByTestId("chat-reply").last()).toContainText("喜欢热闹");
  checks.push("无密钥真实 UI 可对话，Enter 不推进世界，输入区不推进世界、场景保持可交互");
  await page.getByRole("button",{name:"关闭对话"}).click();await openChat("aning");
  await sendUI("你喜欢什么？");await expect(page.getByTestId("chat-reply").last()).toContainText("安静阅读");
  assert.equal((await history("aning")).length,1);assert.equal((await history("aqing")).length,2);
  assert.deepEqual(await world(),initial);checks.push("两名 NPC 人设不同、持久化历史隔离，对话不改变世界");
  await page.getByRole("button",{name:"关闭对话"}).click();
  await page.getByRole("button",{name:"推进一步"}).click();await expect(page.getByTestId("revision")).toHaveText("存档版本 1");
  const advanced=await world();const fresh=await post("aqing","你现在在干什么？");assert.equal(fresh.status,200);assert.ok(fresh.data.reply.includes("麦香咖啡馆"));
  for(const bad of [""," ",null,35,"x".repeat(501)])assert.equal((await post("aqing",bad)).status,400);
  assert.equal((await post("missing","你好")).status,404);
  assert.equal((await fetch(`${base}/api/npcs/missing/chat`)).status,404);
  assert.equal((await fetch(`${base}/api/npcs/aqing/chat`,{method:"POST",body:"invalid"})).status,400);
  const cross=await fetch(`${base}/api/npcs/aqing/chat`,{method:"POST",headers:{origin:"http://foreign.invalid"},body:JSON.stringify({message:"你好"})});assert.equal(cross.status,403);
  checks.push("回答使用推进后的真实地点/行动；非法消息、NPC 与跨站请求正确拒绝");
  const beforeHistory=await history("aqing");await stop();await start(true);
  assert.deepEqual(await history("aqing"),beforeHistory);assert.deepEqual(await world(),advanced);
  checks.push("后台重启恢复持久对话，不重置世界");
  await page.reload();await expect(page.getByTestId("revision")).toHaveText("存档版本 1");
  // Selection opens the scene composer directly.
  await openChat("aqing");
  const waitRequest=page.waitForResponse(r=>r.url().endsWith("/aqing/chat")&&r.request().method()==="POST");
  await page.getByRole("textbox").fill("你现在在干什么？");await page.getByRole("button",{name:"发送消息"}).click();
  await expect(page.getByRole("status").filter({hasText:"正在想一想"})).toBeVisible();
  await waitRequest;
  await expect(page.getByTestId("reply-source").last()).toHaveText("AI · 本地测试替身");
  await expect(page.getByTestId("chat-reply").last()).toContainText("麦香咖啡馆");
  await page.screenshot({path:`${dir}/03-adapter-success-local-stub.png`,fullPage:true});
  checks.push("本机 HTTP 替身走完整模型适配器，UI 等待及 ai 来源标签正确（非真实模型验收）");
  await sendUI("__long__");
  const longReply=await page.getByTestId("chat-reply").textContent();assert.ok(longReply.length>500);
  const bounded=await page.getByTestId("chat-reply").evaluate(el=>({visible:el.clientHeight,total:el.scrollHeight}));assert.ok(bounded.total>bounded.visible);
  await page.getByRole("button",{name:"展开全文与历史"}).click();await expect(page.getByTestId("chat-turn").last()).toContainText(longReply);await page.getByRole("button",{name:"关闭历史"}).click();
  checks.push("长回复在头顶限为两行，全文保留并可在次级历史面板阅读");
  await sendUI("__error__");await expect(page.getByTestId("reply-source").last()).toHaveText("降级回复 · 模型服务暂不可用");
  await page.screenshot({path:`${dir}/04-fallback-service-error.png`,fullPage:true});
  const began=Date.now();await sendUI("__timeout__");const timeoutMs=Date.now()-began;
  await expect(page.getByTestId("reply-source").last()).toHaveText("降级回复 · 模型响应超时");assert.ok(timeoutMs<3000);
  assert.equal((await post("aqing","__network__")).data.reason,"network");
  assert.equal((await post("aqing","__empty__")).data.reason,"invalid_response");
  checks.push("真实 HTTP 503/断连/空回复/超时均降级，超时界面在有限时间内解除等待");
  await post("aqing","阿晴独有暗号橙子");await post("aning","你还记得刚才的话吗");
  const ningContext=JSON.stringify(captures.at(-1).messages);assert.ok(!ningContext.includes("阿晴独有暗号橙子"));assert.ok(ningContext.includes("阿宁"));
  const concurrent=await Promise.all([post("aqing","请稍等一会儿"),post("aqing","同时发出的另一条")]);
  assert.deepEqual(concurrent.map(r=>r.status).sort(),[200,409]);
  // Fill this isolated NPC's history; context remains four complete turns.
  for(let i=0;i<13;i++)assert.equal((await post("aqing",`记录 ${i}`)).status,200);
  const capped=await history("aqing");assert.equal(capped.length,20);assert.equal(captures.at(-1).messages.length,3);
  checks.push("模型上下文隔离、四轮上下文与20轮存储上限、并发409无覆盖");
  assert.deepEqual(await world(),advanced);assert.equal(pageErrors.length,0);
  await page.getByRole("button",{name:"关闭对话"}).click();
  await page.route("**/api/npcs/aqing/chat",async route=>{
    if(route.request().method()==="GET")await route.fulfill({status:503,contentType:"application/json",body:JSON.stringify({error:"history unavailable"})});else await route.continue();
  },{times:1});
  await page.getByTestId("npc-aqing").click();
  await expect(page.getByTestId("scene-composer").getByRole("alert")).toContainText("读取失败");
  const turnsBeforeError=await history("aqing"), callsBeforeError=captures.length;
  await page.getByRole("textbox").fill("读取失败时不应发出这条");await page.getByRole("textbox").press("Enter");
  await expect(page.getByRole("button",{name:"发送消息"})).toBeDisabled();
  assert.equal(captures.length,callsBeforeError);assert.deepEqual(await history("aqing"),turnsBeforeError);
  await page.getByRole("button",{name:"重读记录"}).click();await expect(page.getByTestId("scene-composer").getByRole("alert")).not.toBeVisible();
  checks.push("历史读取故障可恢复，键盘不能绕过禁用发送按钮");
  const output=await page.content();assert.ok(!output.includes(dummyKey));assert.ok(!output.includes("private provider error"));
  const finalHistory=await history("aqing");await stop();await start(false);
  assert.deepEqual(await history("aqing"),finalHistory);assert.deepEqual(await world(),advanced);
  await writeFile(`${dir}/world-before-chat.json`,JSON.stringify(advanced,null,2));
  await writeFile(`${dir}/world-after-chat.json`,JSON.stringify(await world(),null,2));
  await writeFile(`${dir}/result.json`,JSON.stringify({worldId,pids,checks,pageErrors,timeoutMs,retainedTurns:capped.length,modelCallsToLocalStub:captures.length,realModelCall:"未执行；未触发外部服务；只允许隔离本地替身",database:"ai_town_mvp_test",date:new Date().toISOString()},null,2));
  console.log(`${checks.length} chat integration/browser groups passed; timeout ${timeoutMs}ms; real model NOT tested.`);
}catch(error){
  if(page)await page.screenshot({path:`${dir}/failure.png`,fullPage:true});
  throw error;
}finally{
  await browser?.close();await stop();stub.closeAllConnections();await new Promise(resolve=>stub.close(resolve));log.end();
}
