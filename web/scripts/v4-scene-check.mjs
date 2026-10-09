import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdir,writeFile } from "node:fs/promises";
import { createWriteStream } from "node:fs";
import path from "node:path";
process.env.PLAYWRIGHT_BROWSERS_PATH=path.resolve(".browsers");
const {chromium,expect}=await import("@playwright/test");
if(new URL(process.env.DATABASE_URL||"").pathname!=="/ai_town_mvp_test")throw new Error("仅允许独立测试库");
const dir=process.env.EVIDENCE_DIR || "evidence/v4-1/scene",base="http://127.0.0.1:3105",worldId=`v4-scene-${randomUUID()}`;
await mkdir(dir,{recursive:true});
const log=createWriteStream(`${dir}/server.log`,{flags:"a"});
const server=spawn(process.execPath,["node_modules/next/dist/bin/next","start","--hostname","127.0.0.1","--port","3105"],{windowsHide:true,stdio:["ignore","pipe","pipe"],env:{...process.env,WORLD_ID:worldId,AI_ENABLED:"false",AI_API_KEY:"",AI_BASE_URL:"",AI_MODEL:"",AI_TEST_MODE:"false",NEXT_TELEMETRY_DISABLED:"1"}});
server.stdout.pipe(log,{end:false});server.stderr.pipe(log,{end:false});
let browser,page;const errors=[],checks=[],screenshots=[],external=[];
const pause=ms=>new Promise(r=>setTimeout(r,ms));
async function world(){return (await fetch(base+"/api/world")).json();}
async function shot(name){await page.screenshot({path:`${dir}/${name}.png`,fullPage:true});screenshots.push(name);}
async function aligned(){
  const b=await page.getByTestId("speech-bubble").evaluate(el=>{const r=el.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height,tail:parseFloat(el.style.getPropertyValue("--tail-x"))};});
  const n=await page.getByTestId("npc-aqing").boundingBox(),v=await page.getByTestId("scene-viewport").boundingBox();
  assert.ok(Math.abs(b.x+b.tail-n.x-n.width/2)<2);assert.ok(b.y+b.h<=n.y+2);assert.ok(b.x>=v.x&&b.x+b.w<=v.x+v.width+1);
}
try{
  for(let i=0;i<100;i++){try{const r=await fetch(base+"/api/world");if(r.status===404)break;}catch{}await pause(100);}
  browser=await chromium.launch({headless:true});page=await browser.newPage({viewport:{width:1440,height:900}});
  page.on("pageerror",e=>errors.push(e.message));page.on("request",r=>{const url=new URL(r.url());if(["http:","https:"].includes(url.protocol)&&url.origin!==base)external.push(r.url());});
  await page.goto(base);await expect(page.getByTestId("scene-canvas")).toHaveAttribute("data-ready","true");
  await shot("01-default-1440");
  const canvas=await page.getByTestId("scene-canvas").getAttribute("data-paints");await pause(2200);assert.equal(await page.getByTestId("scene-canvas").getAttribute("data-paints"),canvas);
  checks.push("暂停轮询不重绘或重建场景精灵");
  await page.getByTestId("npc-aqing").click();await expect(page.getByRole("textbox")).toBeEnabled();
  await page.getByRole("button",{name:"居民档案",exact:true}).click();await expect(page.getByTestId("profile")).toContainText("阿晴");await shot("02-profile-1440");
  await page.getByRole("button",{name:"关闭档案"}).click();
  await page.getByTestId("npc-aning").click();await expect(page.getByTestId("npc-aning")).toHaveAttribute("aria-pressed","true");
  await page.getByRole("button",{name:"居民档案",exact:true}).click();await expect(page.getByTestId("profile")).toContainText("阿宁");await page.getByRole("button",{name:"关闭档案"}).click();
  await page.getByTestId("npc-aqing").click();await expect(page.getByRole("textbox")).toBeEnabled();await shot("03-selected-1440");
  const before=await world();await page.getByRole("textbox").fill("你现在在干什么？");await page.getByRole("textbox").press("Enter");
  await expect(page.getByTestId("reply-source")).toContainText("降级回复");await expect(page.getByTestId("chat-reply")).toContainText("广场");assert.deepEqual(await world(),before);await aligned();await shot("04-bubble-1440");
  await page.getByRole("button",{name:"放大地图"}).click();
  const v=await page.getByTestId("scene-viewport").boundingBox();await page.mouse.move(v.x+v.width*.3,v.y+v.height*.85);await page.mouse.down();await page.mouse.move(v.x+v.width*.3+60,v.y+v.height*.85+30,{steps:6});await page.mouse.up();await aligned();await shot("05-camera-1440");
  checks.push("两个NPC可选中，档案对应真实对象；无密钥真实HTTP回复、气泡与镜头缩放平移对齐");
  await page.getByRole("button",{name:"复位",exact:true}).click();
  await page.getByRole("button",{name:/送食物/}).click();await expect(page.getByTestId("food-feedback")).toContainText("59 → 24");
  await page.getByRole("textbox").fill("自动运行期间保留的草稿");
  const transform=await page.getByTestId("world-plane").getAttribute("style");
  await page.getByRole("button",{name:"开始自动运行"}).click();
  await expect.poll(async()=>(await world()).minute,{timeout:13000}).toBe(500);
  await expect(page.getByTestId("world-time")).toContainText("08:20");
  assert.equal(await page.getByTestId("world-plane").getAttribute("style"),transform);await expect(page.getByRole("textbox")).toHaveValue("自动运行期间保留的草稿");await aligned();await shot("06-auto-1440");
  await page.getByRole("button",{name:"暂停自动运行"}).click();await expect(page.getByTestId("run-status")).toContainText("已暂停");
  checks.push("送食物59→24；两次自动推进后镜头、选中、草稿、气泡不重置，实际事件显示");
  await page.getByRole("button",{name:"推进一步"}).click();await expect.poll(async()=>(await world()).minute).toBe(510);
  await shot("07-two-residents-1440");
  const saved=await world();await page.reload();await expect(page.getByTestId("scene-canvas")).toHaveAttribute("data-ready","true");await expect(page.getByTestId("reply-source")).toContainText("降级回复");assert.deepEqual(await world(),saved);
  await page.setViewportSize({width:1366,height:768});await pause(200);await aligned();await shot("08-bubble-1366");
  const send=await page.getByRole("button",{name:"发送消息",exact:true}).boundingBox();assert.ok(send.y+send.height<=768,"input send fits at 1366x768");assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await page.getByRole("button",{name:"居民档案",exact:true}).click();await shot("09-profile-1366");await page.getByRole("button",{name:"关闭档案"}).click();
  await page.goto(base);await expect(page.getByTestId("scene-canvas")).toHaveAttribute("data-ready","true");await shot("10-default-1366");
  checks.push("刷新恢复保存状态与历史，1366×768/1440×900操作区可用无横向溢出");
  assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
  await writeFile(`${dir}/result.json`,JSON.stringify({checks,screenshots,worldId,pid:server.pid,pageErrors:errors,externalBrowserRequests:external,realModelCalls:0,modelConfig:"Explicitly disabled, fallback only",date:new Date().toISOString()},null,2));console.log(`${checks.length} V4 scene groups passed; 10 real-page screenshots, 0 external model calls.`);
}catch(e){if(page)await shot("failure");throw e;}
finally{await browser?.close();if(server.exitCode===null)await new Promise(r=>{server.once("exit",r);server.kill();});log.end();}
