import assert from "node:assert/strict";
import {spawn} from "node:child_process";
import {randomUUID} from "node:crypto";
import {createServer} from "node:http";
import {createWriteStream} from "node:fs";
import {mkdir,writeFile} from "node:fs/promises";
import path from "node:path";
import {database,initializeWorld,readWorld,tickWorld} from "../src/lib/store.ts";
import {reserveChatQuota} from "../src/lib/chat-limits.ts";

const real=process.argv.includes("--real");
if(new URL(process.env.DATABASE_URL||"").pathname!=="/ai_town_mvp_test")throw new Error("仅允许测试库");
if(real&&(process.env.ALLOW_REAL_AI!=="1"||!process.env.AI_API_KEY||!process.env.AI_BASE_URL||!process.env.AI_MODEL))throw new Error("真实验收需要显式授权开关及本项目配置");
const dir=process.env.EVIDENCE_DIR || (real?"evidence/v5-1/real":"evidence/v5-1/security"),id=`v51-${randomUUID()}`,base="http://127.0.0.1:3107";
await mkdir(dir,{recursive:true});const log=createWriteStream(`${dir}/server.log`,{flags:"a"});
process.env.PLAYWRIGHT_BROWSERS_PATH=path.resolve(".browsers");
const {chromium,expect}=await import("@playwright/test");
let server,browser,page,calls=0;const checks=[],snapshots=[],errors=[];
const stub=createServer(async(req,res)=>{
  calls++;let body="";for await(const part of req)body+=part;
  const messages=JSON.parse(body).messages,facts=JSON.parse(messages[0].content.split("世界事实：\n")[1]);
  if(messages.at(-1).content==="模拟模型错误"){res.writeHead(503);res.end("private-error");return;}
  res.setHeader("Content-Type","application/json");res.end(JSON.stringify({choices:[{message:{content:`[本地替身] 当前在${facts.location}，${facts.action}。`+"历史不代表当前；完整原文必须保留。".repeat(60)}}]}));
});
if(!real)await new Promise(r=>stub.listen(0,"127.0.0.1",r));
async function start(){
  server=spawn(process.execPath,["node_modules/next/dist/bin/next","start","--hostname","127.0.0.1","--port","3107"],{windowsHide:true,stdio:["ignore","pipe","pipe"],env:{...process.env,WORLD_ID:id,PUBLIC_DEMO:"true",COOKIE_SIGNING_SECRET:"test-only-signing-secret-not-for-production-52",AI_ENABLED:"true",AI_API_KEY:real?process.env.AI_API_KEY:"v51-local-dummy",AI_BASE_URL:real?process.env.AI_BASE_URL:`http://127.0.0.1:${stub.address().port}/v1`,AI_MODEL:real?process.env.AI_MODEL:"stub",AI_TEST_MODE:real?"false":"true",AI_CALLS_PER_DAY:"2",CHAT_REQUESTS_PER_MINUTE:"30",NEXT_TELEMETRY_DISABLED:"1"}});
  server.stdout.pipe(log,{end:false});server.stderr.pipe(log,{end:false});
  for(let i=0;i<100;i++){if(server.exitCode!==null)throw new Error("服务提前退出");try{if((await fetch(base+"/api/world")).ok)return;}catch{}await new Promise(r=>setTimeout(r,100));}throw new Error("启动超时");
}
async function stop(){if(server?.exitCode===null)await new Promise(r=>{server.once("exit",r);server.kill();});}
async function send(message){
  const before=await readWorld(id),response=page.waitForResponse(r=>r.url().endsWith("/aqing/chat")&&r.request().method()==="POST");
  await page.getByRole("textbox").fill(message);await page.getByRole("button",{name:"发送消息"}).click();
  const r=await response;assert.equal(r.status(),200);const turn=await r.json();
  await expect(page.getByRole("textbox")).toHaveValue("");assert.deepEqual(await readWorld(id),before);
  assert.equal(turn.worldRevision,before.revision);snapshots.push({world:before,turn});return turn;
}
try{
  await initializeWorld(id);
  if(!real){
    const quotaId=`v51-quota-${randomUUID()}`;await initializeWorld(quotaId);
    process.env.AI_CALLS_PER_DAY="3";
    const reservations=await Promise.all(Array.from({length:20},()=>reserveChatQuota(quotaId,"model")));
    assert.equal(reservations.filter(Boolean).length,3);
    await database().query("UPDATE town_chat_limits SET bucket=bucket+1 WHERE world_id=$1 AND kind='model'",[quotaId]);
    assert.equal(await reserveChatQuota(quotaId,"model"),false);
    checks.push("20个并发数据库预留只有3个成功；配额行原子更新，较旧时间桶不能重置新桶预算");
  }
  await start();browser=await chromium.launch({headless:true});page=await browser.newPage({viewport:{width:1440,height:900}});page.on("pageerror",e=>errors.push(e.message));
  const init=await fetch(base+"/api/world/init",{method:"POST"});assert.equal(init.status,403);
  const oversized=await fetch(base+"/api/npcs/aqing/chat",{method:"POST",body:"x".repeat(5000)});assert.equal(oversized.status,400);
  const headers=await fetch(base);assert.equal(headers.headers.get("x-frame-options"),"DENY");
  await page.goto(base+"/?npc=aqing");await expect(page.getByTestId("scene-canvas")).toHaveAttribute("data-ready","true");await expect(page.getByRole("textbox")).toBeEnabled();
  if(real){
    let world=await readWorld(id);world=await tickWorld(world.revision,id);assert.equal(world.npcs[0].location,"cafe");
    await expect(page.getByTestId("revision")).toHaveText(`存档版本 ${world.revision}`);
    const first=await send("你现在在哪、正在做什么？请用两句话回答。");assert.equal(first.source,"ai");assert.equal(first.testMode,undefined);
    await page.screenshot({path:`${dir}/01-ai-cafe.png`,fullPage:true});
    for(let i=0;i<8&&world.npcs[0].location!=="square";i++)world=await tickWorld(world.revision,id);
    assert.equal(world.npcs[0].location,"square");await expect(page.getByTestId("revision")).toHaveText(`存档版本 ${world.revision}`);
    await expect(page.getByTestId("speech-bubble")).toContainText("历史发言");
    const current=await send("刚才你说在咖啡馆，现在你在哪、正在做什么？请明确区分刚才和现在。");
    assert.equal(current.source,"ai");assert.ok(current.reply.includes("树荫广场"));
    await expect(page.getByTestId("npc-aqing")).toHaveAttribute("data-motion","idle");await page.screenshot({path:`${dir}/02-ai-current-square.png`,fullPage:true});
    checks.push("两次真实模型调用：咖啡馆→规则推进到广场→带旧咖啡馆对话回答当前广场；对话不改变世界");
  } else {
    const turn=await send("你现在在哪？");assert.equal(turn.source,"ai");assert.equal(turn.testMode,true);assert.ok(turn.reply.length>800);
    const size=await page.getByTestId("chat-reply").evaluate(el=>({visible:el.clientHeight,total:el.scrollHeight,clamp:getComputedStyle(el).webkitLineClamp}));assert.equal(size.clamp,"2");assert.ok(size.total>size.visible);
    await page.screenshot({path:`${dir}/01-short-bubble-full-original.png`,fullPage:true});
    await page.getByRole("button",{name:"展开全文与历史"}).click();await expect(page.getByTestId("chat-turn").last()).toContainText(turn.reply);await page.screenshot({path:`${dir}/02-full-history.png`,fullPage:true});await page.getByRole("button",{name:"关闭历史"}).click();
    assert.equal((await send("模拟模型错误")).reason,"service_error");assert.equal(calls,2);
    checks.push("长回复超过800字仍完整持久化；气泡两行预览；503本地替身降级且计入预算");
  }
  const before=await readWorld(id),history=await(await page.request.get(base+"/api/npcs/aqing/chat")).json();
  await stop();await start();assert.deepEqual(await readWorld(id),before);assert.deepEqual(await(await page.request.get(base+"/api/npcs/aqing/chat")).json(),history);
  await page.reload();await expect(page.getByRole("textbox")).toBeEnabled();
  assert.equal((await send("你现在在干什么？")).reason,"budget_exhausted");if(!real)assert.equal(calls,2);
  await page.screenshot({path:`${dir}/03-budget-fallback-after-restart.png`,fullPage:true});
  checks.push("重启世界/对话/用量恢复一致；两次额度用尽返回状态驱动降级，没有第三次模型请求；公开初始化403，大请求400，安全头有效");
  if(!real){
    // Only this fresh isolated world's request bucket is fault-injected.
    await database().query("UPDATE town_chat_limits SET used=30,bucket=floor(extract(epoch FROM clock_timestamp())/60)::bigint WHERE world_id=$1 AND kind='request'",[id]);
    const limited=await fetch(base+"/api/npcs/aqing/chat",{method:"POST",headers:{"Content-Type":"application/json",cookie:(await page.context().cookies(base)).map(c=>`${c.name}=${c.value}`).join("; ")},body:JSON.stringify({message:"限流验证"})});assert.equal(limited.status,429);assert.equal(calls,2);checks.push("共享分钟额度耗尽返回429，未发模型请求");
  }
  assert.equal(errors.length,0);await writeFile(`${dir}/result.json`,JSON.stringify({date:new Date().toISOString(),worldId:id,checks,errors,realModel:real,provider:real?{host:new URL(process.env.AI_BASE_URL).hostname,model:process.env.AI_MODEL}:"loopback-stub",modelCalls:real?2:calls,snapshots},null,2));console.log(`${checks.length} V5.1 groups passed; realModel=${real}; modelCalls=2`);
}catch(e){await page?.screenshot({path:`${dir}/failure.png`,fullPage:true});await writeFile(`${dir}/partial.json`,JSON.stringify({checks,snapshots,realModel:real},null,2));throw e;}
finally{await browser?.close();await stop();if(!real){stub.closeAllConnections();await new Promise(r=>stub.close(r));}log.end();await database().end();}
