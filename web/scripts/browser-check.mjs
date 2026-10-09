import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { createWriteStream } from "node:fs";
import path from "node:path";
process.env.PLAYWRIGHT_BROWSERS_PATH = path.resolve(".browsers");
const { chromium, expect } = await import("@playwright/test");
if(new URL(process.env.DATABASE_URL || "").pathname!=="/ai_town_mvp_test") throw new Error("只允许独立测试库");
const id=`browser-${randomUUID()}`;
const base="http://127.0.0.1:3101";
const dir=process.env.EVIDENCE_DIR || "evidence/scene-chat/world-regression";
await mkdir(dir,{recursive:true});
const log=createWriteStream(`${dir}/browser-server.log`,{flags:"a"});
let server, browser;
const pids=[], checks=[], errors=[];
async function start() {
  server=spawn(process.execPath,["node_modules/next/dist/bin/next","start","--hostname","127.0.0.1","--port","3101"],{cwd:process.cwd(),windowsHide:true,env:{...process.env,WORLD_ID:id,NEXT_TELEMETRY_DISABLED:"1",AI_ENABLED:"false",AI_API_KEY:"",AI_BASE_URL:"",AI_MODEL:""},stdio:["ignore","pipe","pipe"]});
  pids.push(server.pid);server.stdout.pipe(log,{end:false});server.stderr.pipe(log,{end:false});
  for(let i=0;i<120;i++) {
    if(server.exitCode!==null) throw new Error(`Server exited ${server.exitCode}`);
    try {const r=await fetch(`${base}/api/world`);if(r.status===404 || r.ok)return;} catch {}
    await new Promise(resolve=>setTimeout(resolve,250));
  }
  throw new Error("服务启动超时");
}
async function stop() {
  if(!server||server.exitCode!==null)return;
  const current=server;
  await new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>reject(new Error("测试后台未退出")),10000);
    current.once("exit",()=>{clearTimeout(timer);resolve();});current.kill();
  });
}
const getWorld=async()=>{const r=await fetch(`${base}/api/world`);assert.equal(r.status,200);return r.json();};
try {
  await start();
  assert.equal((await fetch(`${base}/api/world`)).status,404);
  browser=await chromium.launch({headless:true});
  const page=await browser.newPage({viewport:{width:1440,height:1100},deviceScaleFactor:1});
  page.on("pageerror",e=>errors.push(e.message));
  const apiReads=[];
  page.on("response",r=>{if(r.url().endsWith("/api/world"))apiReads.push(r.status());});
  await page.goto(base);
  await expect(page.getByTestId("scene-canvas")).toHaveAttribute("data-ready","true");
  await expect(page.getByTestId("revision")).toHaveText("存档版本 0");
  const seed=await getWorld();assert.equal(seed.npcs.length,2);assert.equal(seed.locations.length,3);
  checks.push("页面 HTTP GET 404 后独立 POST 初始化，两人三地点可见");
  await page.screenshot({path:`${dir}/01-scene.png`,fullPage:true});
  await page.getByTestId("npc-aqing").click();
  await page.getByRole("button",{name:"居民档案",exact:true}).click();
  await expect(page.getByTestId("profile").getByRole("heading",{name:"阿晴",exact:true})).toBeVisible();
  await page.getByTestId("npc-aning").click();
  await page.getByRole("button",{name:"居民档案",exact:true}).click();
  await expect(page.getByTestId("profile").getByRole("heading",{name:"阿宁",exact:true})).toBeVisible();
  await expect(page.getByTestId("stat-hunger")).toHaveText(String(seed.npcs[1].hunger));
  await page.screenshot({path:`${dir}/02-profile.png`,fullPage:true});
  checks.push("点击不同地图居民显示正确档案、属性与选中反馈");
  const tickResponse=page.waitForResponse(r=>r.url().endsWith("/api/world/tick")&&r.status()===200);
  await page.getByRole("button",{name:"推进一步"}).evaluate(button=>{button.click();button.click();});
  const saved=await (await tickResponse).json();
  await expect(page.getByTestId("revision")).toHaveText("存档版本 1");
  assert.deepEqual(await getWorld(),saved);
  await expect(page.getByTestId("stat-hunger")).toHaveText(String(saved.npcs[1].hunger));
  await expect(page.getByTestId("npc-aning")).toHaveAttribute("aria-pressed","true");
  checks.push("连续点击只推进一次，HTTP 返回、后台重读、页面属性与选中一致");
  await page.getByRole("button",{name:"关闭档案"}).click();
  await page.screenshot({path:`${dir}/03-advanced.png`,fullPage:true});
  await page.reload();
  await expect(page.getByTestId("revision")).toHaveText("存档版本 1");
  await page.getByRole("button",{name:"居民档案",exact:true}).click();
  await expect(page.getByTestId("profile").getByRole("heading",{name:"阿宁",exact:true})).toBeVisible();
  assert.deepEqual(await getWorld(),saved);checks.push("刷新恢复推进后的存档和 URL 居民选择");
  const initAgain=await fetch(`${base}/api/world/init`,{method:"POST"});assert.deepEqual(await initAgain.json(),saved);
  const invalid=await fetch(`${base}/api/world/tick`,{method:"POST",body:JSON.stringify({expectedRevision:-1})});assert.equal(invalid.status,400);
  const foreign=await fetch(`${base}/api/world/tick`,{method:"POST",headers:{origin:"http://example.invalid"},body:JSON.stringify({expectedRevision:1})});assert.equal(foreign.status,403);
  const concurrent=await Promise.all([0,1].map(()=>fetch(`${base}/api/world/tick`,{method:"POST",body:JSON.stringify({expectedRevision:1})})));
  assert.deepEqual(concurrent.map(r=>r.status).sort(),[200,409]);checks.push("真实 HTTP 并发一成功一冲突，非法版本不写入，再初始化不重置");
  // UI is now stale: conflict refreshes authoritative state, without an optimistic extra tick.
  await page.getByRole("button",{name:"推进一步"}).click();
  await expect(page.locator(".status-line [role=status]")).toContainText("世界已被推进");
  await expect(page.getByTestId("revision")).toHaveText("存档版本 2");
  checks.push("前端冲突显示错误并重读，不覆盖后台状态");
  // Local transport fault, explicitly not a model or PostgreSQL success simulation.
  await page.route("**/api/world/tick",route=>route.abort(),{times:1});
  await page.getByRole("button",{name:"推进一步"}).click();
  await expect(page.getByRole("button",{name:"重新读取"})).toBeVisible();
  assert.equal((await getWorld()).revision,2);
  await page.getByRole("button",{name:"重新读取"}).click();
  await expect(page.locator(".status-line [role=status]")).toContainText("已重新读取存档");
  checks.push("请求失败不乐观更新，手动重新读取可恢复操作");
  await page.getByRole("button",{name:"打开日志"}).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByRole("dialog").locator("article")).toHaveCount(4);
  await page.getByRole("button",{name:"关闭日志"}).click();
  const before=await getWorld();await writeFile(`${dir}/before-restart.json`,JSON.stringify(before,null,2));
  await stop();await start();
  const after=await getWorld();assert.deepEqual(after,before);assert.notDeepEqual(after,seed);
  await writeFile(`${dir}/after-restart.json`,JSON.stringify(after,null,2));
  await page.reload();await expect(page.getByTestId("revision")).toHaveText("存档版本 2");
  await page.getByRole("button",{name:"居民档案",exact:true}).click();
  await expect(page.getByTestId("profile").getByRole("heading",{name:"阿宁",exact:true})).toBeVisible();
  checks.push("结束并重启 Next 后台进程，推进后的世界、NPC、事件完全一致");
  assert.equal(errors.length,0);assert.ok(apiReads.includes(200));
  const result={worldId:id,backendPids:pids,checks,apiReads,pageErrors:errors,revision:after.revision,database:"ai_town_mvp_test",realAI:"已可配置，本轮未调用",date:new Date().toISOString()};
  await writeFile(`${dir}/browser-check.json`,JSON.stringify(result,null,2));
  console.log(`${checks.length} browser/API/restart checks passed`,result);
} finally {await browser?.close();await stop();log.end();}
