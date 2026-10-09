import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { createWriteStream } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
process.env.PLAYWRIGHT_BROWSERS_PATH=path.resolve(".browsers");
const {chromium,expect}=await import("@playwright/test");
if(new URL(process.env.DATABASE_URL||"").pathname!=="/ai_town_mvp_test")throw new Error("仅允许独立测试库");
const dir=process.env.EVIDENCE_DIR || "evidence/v3",base="http://127.0.0.1:3104",worldId=`v3-browser-${randomUUID()}`;
await mkdir(dir,{recursive:true});
const log=createWriteStream(`${dir}/server.log`,{flags:"a"});
let server,browser,page,second,modelCalls=0,modelFails=false;
const pids=[],checks=[],errors=[],automaticSamples=[];
const stub=createServer(async(req,res)=>{
  modelCalls++;assert.equal(req.url,"/v1/chat/completions");
  let raw="";for await(const p of req)raw+=p;
  if(modelFails){res.writeHead(503);res.end("isolated test failure");return;}
  const messages=JSON.parse(raw).messages;
  const facts=JSON.parse(messages[0].content.split("世界事实：\n")[1]);
  res.setHeader("Content-Type","application/json");res.end(JSON.stringify({choices:[{message:{content:`[本地测试替身] 我是${facts.name}，在${facts.location}，正在${facts.action}。`}}]}));
});
await new Promise(r=>stub.listen(0,"127.0.0.1",r));
const pause=ms=>new Promise(r=>setTimeout(r,ms));
async function world(){const r=await fetch(`${base}/api/world`);assert.equal(r.status,200);return r.json();}
async function post(endpoint,body){const r=await fetch(base+endpoint,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});return {status:r.status,data:await r.json()};}
async function start(){
  server=spawn(process.execPath,["node_modules/next/dist/bin/next","start","--hostname","127.0.0.1","--port","3104"],{windowsHide:true,stdio:["ignore","pipe","pipe"],env:{...process.env,WORLD_ID:worldId,AI_ENABLED:"true",AI_API_KEY:"v3-local-stub-not-a-real-key",AI_BASE_URL:`http://127.0.0.1:${stub.address().port}/v1`,AI_MODEL:"v3-local-stub",AI_TEST_MODE:"true",AI_TIMEOUT_MS:"1000",NEXT_TELEMETRY_DISABLED:"1"}});
  pids.push(server.pid);server.stdout.pipe(log,{end:false});server.stderr.pipe(log,{end:false});
  for(let i=0;i<100;i++){try{const r=await fetch(base+"/api/world");if(r.ok||r.status===404)return;}catch{}await pause(100);}throw new Error("后台启动超时");
}
async function stop(){if(server?.exitCode===null)await new Promise(r=>{server.once("exit",r);server.kill();});}
async function screenshot(name){await page.screenshot({path:`${dir}/${name}.png`,fullPage:true});}
try{
  await start();browser=await chromium.launch({headless:true});
  page=await browser.newPage({viewport:{width:1440,height:1260}});second=await browser.newPage({viewport:{width:1440,height:1260}});
  for(const tab of [page,second])tab.on("pageerror",e=>errors.push(e.message));
  await page.goto(base);await expect(page.getByTestId("scene-canvas")).toHaveAttribute("data-ready","true");
  await second.goto(base);await expect(second.getByTestId("run-status")).toContainText("已暂停");
  await page.getByTestId("npc-aqing").click();await expect(page.getByRole("textbox")).toBeEnabled();
  await page.getByRole("button",{name:"居民档案",exact:true}).click();
  await expect(page.getByTestId("care-hunger")).toHaveText("59");await screenshot("01-before-food");
  const foodResponse=page.waitForResponse(r=>r.url().endsWith("/world/interventions"));
  await page.getByRole("button",{name:/送食物/}).evaluate(b=>{b.click();b.click();});
  const food=await (await foodResponse).json();assert.equal(food.npcs[0].hunger,24);assert.equal(food.revision,1);assert.equal(food.minute,480);
  await expect(page.getByTestId("food-feedback")).toContainText("59 → 24");await expect(page.getByTestId("stat-hunger")).toHaveText("24");
  await screenshot("02-after-food");checks.push("一次/重复点击送食物仅落库一次，真实饥饿59→24，时间不变，档案和事件一致");
  await page.getByRole("button",{name:"推进一步"}).click();await expect(page.getByTestId("npc-action")).toHaveText("与邻居闲聊");
  assert.equal((await world()).minute,490);checks.push("干预后的手动下一步读取饥饿24，阿晴在广场社交");
  await page.getByRole("button",{name:"关闭档案"}).click();
  await page.getByRole("textbox").fill("自动推进期间保留的草稿");await page.getByRole("button",{name:"查看历史",exact:true}).click();
  await page.getByRole("button",{name:"开始自动运行"}).click();await expect(page.getByTestId("run-status")).toContainText("自动运行");
  const running=await world();assert.equal(running.run.running,true);
  await expect(second.getByTestId("run-status")).toContainText("自动运行");
  await expect.poll(async()=>(await world()).minute,{timeout:8500}).toBe(500);
  automaticSamples.push(await world());await screenshot("03-auto-running");
  await expect(page.getByRole("textbox")).toHaveValue("自动推进期间保留的草稿");await expect(page.getByRole("button",{name:"查看历史",exact:true})).toHaveAttribute("aria-expanded","true");
  await expect(page.getByTestId("npc-aqing")).toHaveAttribute("aria-pressed","true");
  // A real intervention while automatic mode is running; its version may conflict but may never overwrite.
  const beforeAutoFood=await world();
  await page.getByRole("button",{name:/送食物/}).click();await expect(page.getByTestId("food-feedback")).toContainText(`饥饿 ${beforeAutoFood.npcs[0].hunger} →`);
  await expect.poll(async()=>(await world()).minute,{timeout:8000}).toBe(510);automaticSamples.push(await world());
  assert.ok(automaticSamples[1].run.nextTickAt-automaticSamples[0].run.nextTickAt>=5000);
  assert.equal(modelCalls,0);checks.push("双标签两个5秒周期只推进两步；运行中干预保存；无额外模型调用，草稿/选中/历史展开保留");
  // Pause from the OTHER tab; even a stale version must pause the latest locked state.
  await second.getByRole("button",{name:"暂停自动运行"}).click();await expect(second.getByTestId("run-status")).toContainText("已暂停");
  await expect(page.getByTestId("run-status")).toContainText("已暂停");
  const paused=await world();await pause(6200);assert.deepEqual(await world(),paused);await screenshot("04-paused");
  checks.push("另一个标签暂停后两页同步，超过一个周期不再自动推进");
  await page.getByRole("button",{name:"关闭历史"}).click();
  await page.getByRole("textbox").fill("你现在在干什么？");await page.getByRole("textbox").press("Enter");
  await expect(page.getByTestId("reply-source")).toHaveText("AI · 本地测试替身");
  const speech=await page.getByTestId("chat-reply").textContent();assert.equal(modelCalls,1);
  modelFails=true;await page.getByRole("textbox").fill("你好");await page.getByRole("textbox").press("Enter");
  await expect(page.getByTestId("reply-source")).toHaveText("降级回复 · 模型服务暂不可用");assert.equal(modelCalls,2);
  await page.getByRole("button",{name:"查看历史",exact:true}).click();await expect(page.getByTestId("chat-turn")).toHaveCount(2);await expect(page.getByTestId("chat-turn").first()).toContainText(speech);
  await page.getByRole("button",{name:"关闭历史"}).click();
  checks.push("场景气泡、聊天上下文及AI成功/错误降级保持正常，只两次显式聊天调用本机替身");
  await page.getByRole("button",{name:"推进一步"}).click();await expect.poll(async()=>(await world()).minute).toBe(paused.minute+10);
  const beforeFailure=await world();
  await page.route("**/api/world/interventions",route=>route.abort(),{times:1});
  await page.getByRole("button",{name:/送食物/}).click();await expect(page.getByRole("button",{name:"重新读取",exact:true})).toBeVisible();
  assert.deepEqual(await world(),beforeFailure);await expect(page.getByTestId("food-feedback")).not.toContainText("已保存");
  await page.getByRole("button",{name:"重新读取",exact:true}).click();
  // Commit succeeds but its response is lost; UI must reread and must not replay the food command.
  await page.route("**/api/world/interventions",async route=>{await route.fetch();await route.abort();},{times:1});
  await page.getByRole("button",{name:/送食物/}).click();await expect(page.getByRole("button",{name:"重新读取",exact:true})).toBeVisible();
  const lostResponse=await world();assert.equal(lostResponse.revision,beforeFailure.revision+1);
  await expect(page.getByTestId("care-hunger")).toHaveText(String(lostResponse.npcs[0].hunger));await expect(page.getByTestId("food-feedback")).not.toContainText("已保存");
  await page.getByRole("button",{name:"重新读取",exact:true}).click();checks.push("网络失败无虚假成功；提交后丢响应只重读，不重复送食物");
  for(const body of [{action:"trade",npcId:"aqing",expectedRevision:0},{action:"feed",npcId:"aqing",expectedRevision:-1},{action:"feed",npcId:3,expectedRevision:0}])assert.equal((await post("/api/world/interventions",body)).status,400);
  assert.equal((await post("/api/world/interventions",{action:"feed",npcId:"missing",expectedRevision:lostResponse.revision})).status,404);
  assert.equal((await post("/api/world/run",{running:"yes",expectedRevision:0})).status,400);
  for(const endpoint of ["interventions","run","wake"]){const r=await fetch(`${base}/api/world/${endpoint}`,{method:"POST",headers:{origin:"https://foreign.invalid"},body:"{}"});assert.equal(r.status,403);}
  checks.push("非法居民/动作/运行开关与跨站修改请求被拒绝");
  await page.reload();await expect(page.getByTestId("run-status")).toContainText("已暂停");await expect(page.getByTestId("npc-aqing")).toHaveAttribute("aria-pressed","true");await expect(page.getByTestId("reply-source")).toContainText("降级回复");
  assert.deepEqual(await world(),lostResponse);
  await page.close();await second.close();second=null;
  const enabled=await post("/api/world/run",{running:true,expectedRevision:lostResponse.revision});assert.equal(enabled.status,200);
  const beforeRestart=await world();await writeFile(`${dir}/before-restart.json`,JSON.stringify(beforeRestart,null,2));
  await stop();await pause(6200);await start();
  const afterRestart=await world();assert.deepEqual(afterRestart,beforeRestart);await writeFile(`${dir}/after-restart.json`,JSON.stringify(afterRestart,null,2));
  page=await browser.newPage({viewport:{width:1440,height:1260}});page.on("pageerror",e=>errors.push(e.message));
  await page.goto(base+"/?npc=aqing");await expect(page.getByTestId("run-status")).toContainText("自动运行");
  await expect.poll(async()=>(await world()).minute).toBe(beforeRestart.minute+10);
  await page.getByRole("button",{name:"暂停自动运行"}).click();await expect(page.getByTestId("run-status")).toContainText("已暂停");
  assert.equal((await world()).minute,beforeRestart.minute+10);assert.equal(modelCalls,2);assert.deepEqual(errors,[]);
  checks.push("运行开关和世界跨后台重启保留；无人访问期间不推进，返回后只补一步；聊天不受世界刷新影响");
  await writeFile(`${dir}/browser-result.json`,JSON.stringify({worldId,pids,checks,automaticSamples,pageErrors:errors,modelCalls,modelDestination:"loopback test stub only",realModelCalls:0,commands:["npm run test:v3"],date:new Date().toISOString()},null,2));
  console.log(`${checks.length} V3 browser/API/restart groups passed; model calls: ${modelCalls} explicit chats to local stub, 0 external.`);
}catch(error){if(page&&!page.isClosed())await screenshot("failure");throw error;}
finally{await browser?.close();await stop();stub.closeAllConnections();await new Promise(r=>stub.close(r));log.end();}
