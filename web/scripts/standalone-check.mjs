import assert from "node:assert/strict";
import {spawn} from "node:child_process";
import {randomUUID} from "node:crypto";
import {cp,mkdir,writeFile} from "node:fs/promises";
import {createWriteStream} from "node:fs";
import path from "node:path";
import {database,initializeWorld} from "../src/lib/store.ts";
if(new URL(process.env.DATABASE_URL||"").pathname!=="/ai_town_mvp_test")throw new Error("只允许测试库");
const id=`standalone-${randomUUID()}`,base="http://127.0.0.1:3108",dir=process.env.EVIDENCE_DIR||"evidence/v5-1/standalone";
await mkdir(dir,{recursive:true});
// Copy only generated build assets into this application's generated standalone directory.
await cp(".next/static",".next/standalone/.next/static",{recursive:true});
await cp("public",".next/standalone/public",{recursive:true});
await initializeWorld(id);const log=createWriteStream(`${dir}/server.log`,{flags:"a"});
let server,browser;
async function start(){
  server=spawn(process.execPath,[".next/standalone/server.js"],{windowsHide:true,stdio:["ignore","pipe","pipe"],env:{...process.env,HOSTNAME:"127.0.0.1",PORT:"3108",WORLD_ID:id,PUBLIC_DEMO:"true",COOKIE_SIGNING_SECRET:"test-only-signing-secret-not-for-production-52",AI_ENABLED:"false",AI_API_KEY:"",AI_BASE_URL:"",AI_MODEL:""}});
  server.stdout.pipe(log,{end:false});server.stderr.pipe(log,{end:false});
  for(let i=0;i<300;i++){if(server.exitCode!==null)throw new Error("standalone exited");try{if((await fetch(base+"/api/world")).ok)return;}catch{}await new Promise(r=>setTimeout(r,100));}throw new Error("standalone timed out");
}
async function stop(){if(server?.exitCode===null)await new Promise(r=>{server.once("exit",r);server.kill();});}
try{
  await start();process.env.PLAYWRIGHT_BROWSERS_PATH=path.resolve(".browsers");const {chromium,expect}=await import("@playwright/test");browser=await chromium.launch({headless:true});const page=await browser.newPage({viewport:{width:1366,height:768}});
  await page.goto(base);await expect(page.getByTestId("scene-canvas")).toHaveAttribute("data-ready","true");
  assert.equal((await fetch(base+"/api/world/init",{method:"POST"})).status,403);
  await page.getByRole("button",{name:"推进一步"}).click();await expect(page.getByTestId("revision")).toHaveText("存档版本 1");
  await page.getByTestId("npc-aqing").click();await expect(page.getByRole("textbox")).toBeEnabled();await page.getByRole("textbox").fill("现在在哪？");await page.getByRole("textbox").press("Enter");await expect(page.getByTestId("reply-source")).toContainText("未配置模型");
  await expect(page.getByTestId("npc-aqing")).toHaveAttribute("data-motion","idle");await page.screenshot({path:`${dir}/01-production-1366.png`,fullPage:true});
  const world=await(await fetch(base+"/api/world")).json();await stop();await start();assert.deepEqual(await(await fetch(base+"/api/world")).json(),world);
  await writeFile(`${dir}/result.json`,JSON.stringify({date:new Date().toISOString(),worldId:id,checks:["standalone入口、静态资源、Pixi和HTTP API实际工作","公开初始化403；手动推进、无密钥聊天可用","1366x768实际页面；后端重启恢复推进后的世界"],platform:process.platform,docker:"未验证，镜像下载网络阻塞",realAI:false},null,2));console.log("3 standalone runtime groups passed on Windows; Docker not verified.");
}finally{await browser?.close();await stop();log.end();await database().end();}
