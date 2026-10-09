import assert from "node:assert/strict";
import {spawn} from "node:child_process";
import {randomUUID} from "node:crypto";
import {mkdir,writeFile,rename} from "node:fs/promises";
import {createWriteStream} from "node:fs";
import path from "node:path";
process.env.PLAYWRIGHT_BROWSERS_PATH=path.resolve(".browsers");
const {chromium,expect}=await import("@playwright/test");
if(new URL(process.env.DATABASE_URL||"").pathname!=="/ai_town_mvp_test")throw new Error("仅允许隔离测试库");
const dir=process.env.EVIDENCE_DIR||"evidence/v8-1/browser",base="http://127.0.0.1:3115",worldId=`v81-browser-${randomUUID()}`;
await mkdir(dir,{recursive:true});const log=createWriteStream(`${dir}/server.log`,{flags:"a"});
let server,browser,a,context,other,video;const checks=[],errors=[],screenshots=[],snapshots=[];
const delay=ms=>new Promise(r=>setTimeout(r,ms));
const world=async()=>await(await fetch(base+"/api/world")).json();
async function start(){
  server=spawn(process.execPath,["node_modules/next/dist/bin/next","start","--hostname","127.0.0.1","--port","3115"],{windowsHide:true,stdio:["ignore","pipe","pipe"],env:{...process.env,WORLD_ID:worldId,PUBLIC_DEMO:"false",AI_ENABLED:"false",AI_API_KEY:"",AI_BASE_URL:"",AI_MODEL:""}});
  server.stdout.pipe(log,{end:false});server.stderr.pipe(log,{end:false});
  for(let i=0;i<100;i++){if(server.exitCode!==null)throw new Error("server exited");try{const r=await fetch(base+"/api/world");if(r.ok||r.status===404)return;}catch{}await delay(100);}throw new Error("server timeout");
}
async function stop(){if(server?.exitCode===null)await new Promise(r=>{server.once("exit",r);server.kill();});}
async function shot(name,page=a){await page.screenshot({path:`${dir}/${name}.png`,fullPage:true});screenshots.push(name);}
async function move(page,axis,target){
  await page.getByTestId("scene-viewport").focus();const value=Number(await page.getByTestId("player").getAttribute(`data-${axis}`)),positive=target>value;
  if(Math.abs(target-value)<=3)return;
  const key=axis==="x"?(positive?"d":"a"):(positive?"s":"w");await page.keyboard.down(key);
  try{await page.waitForFunction(({axis,target,positive})=>{const value=Number(document.querySelector('[data-testid="player"]').dataset[axis]);return positive?value>=target-2:value<=target+2;},{axis,target,positive},{timeout:10000});}finally{await page.keyboard.up(key);}
}
async function enter(page,scene){await page.getByTestId("scene-viewport").focus();await page.keyboard.press("e");await expect(page.getByTestId("scene-canvas")).toHaveAttribute("data-scene",scene);}
async function runOne(){
  const before=await world();await a.getByRole("button",{name:"开始自动运行",exact:true}).click();
  await expect.poll(async()=>(await world()).minute,{timeout:8500}).toBe(before.minute+10);
  await a.getByRole("button",{name:"暂停自动运行",exact:true}).click();await expect(a.getByTestId("run-status")).toContainText("已暂停");
  const after=await world();assert.equal(after.minute,before.minute+10);snapshots.push(after);return after;
}
const performanceResults={};
async function frameSample(page){return page.evaluate(()=>new Promise(resolve=>{let start=0,last=0;const deltas=[];function frame(now){if(!start)start=now;if(last)deltas.push(now-last);last=now;if(deltas.length<90)requestAnimationFrame(frame);else{const sorted=[...deltas].sort((a,b)=>a-b);resolve({samples:deltas.length,elapsedMs:now-start,meanMs:deltas.reduce((a,b)=>a+b,0)/deltas.length,p95Ms:sorted[Math.floor(sorted.length*.95)]});}}requestAnimationFrame(frame);}));}
try{
  await start();browser=await chromium.launch({headless:true});context=await browser.newContext({viewport:{width:1440,height:900},recordVideo:{dir:`${dir}/video`,size:{width:1440,height:900}}});a=await context.newPage();video=a.video();a.on("pageerror",e=>errors.push(e.message));
  const resources=[];a.on("response",r=>{if(r.url().includes("/art/"))resources.push(r.url().split("/art/")[1]);});
  await a.goto(base);await expect(a.getByTestId("scene-canvas")).toHaveAttribute("data-ready","true");const initial=await world();
  const objects=await a.getByTestId("scene-canvas").getAttribute("data-objects"),ground=await a.getByTestId("scene-canvas").getAttribute("data-ground-objects");
  performanceResults.staticObjects={objects:Number(objects),ground:Number(ground)};
  performanceResults.idle=await frameSample(a);const beforePaints=Number(await a.getByTestId("scene-canvas").getAttribute("data-paints"));
  const vp=await a.getByTestId("scene-viewport").boundingBox();await a.mouse.move(vp.x+vp.width*.7,vp.y+vp.height*.8);await a.mouse.down();await a.mouse.move(vp.x+vp.width*.3,vp.y+vp.height*.8,{steps:30});await a.mouse.up();
  performanceResults.panPixiPaints=Number(await a.getByTestId("scene-canvas").getAttribute("data-paints"))-beforePaints;
  await a.getByRole("button",{name:"全景",exact:true}).click();await shot("01-connected-overview");
  await a.getByRole("button",{name:"复位",exact:true}).click();await shot("02-old-district");
  // Use real keyboard movement, no localStorage teleport or patched client world.
  const walking=move(a,"x",1158);performanceResults.walking=await frameSample(a);await walking;await move(a,"y",324);await expect(a.getByTestId("portal-hint")).toContainText("石榴杂货铺");await shot("03-store-street-detail");
  const storeCam=await a.getByTestId("world-plane").getAttribute("style");await enter(a,"store_interior");await shot("04-store-interior");
  const storeObjects=await a.getByTestId("scene-canvas").getAttribute("data-objects");await move(a,"y",310);await move(a,"x",480);await a.keyboard.down("d");await delay(1000);await a.keyboard.up("d");
  // Return on the wide central aisle, avoiding the rear counter.
  await move(a,"y",486);await move(a,"x",480);await enter(a,"town");assert.equal(await a.getByTestId("world-plane").getAttribute("style"),storeCam);
  await move(a,"y",370);await move(a,"x",1030);await move(a,"y",578);await move(a,"x",1510);await move(a,"y",524);await expect(a.getByTestId("portal-hint")).toContainText("青篱小居");await shot("05-cottage-courtyard");await enter(a,"cottage_interior");await shot("06-cottage-interior");
  const cottageObjects=await a.getByTestId("scene-canvas").getAttribute("data-objects");assert.notEqual(storeObjects,cottageObjects);
  await move(a,"y",400);await move(a,"x",370);await move(a,"y",300);await a.keyboard.down("a");await delay(650);await a.keyboard.up("a");const blocked=Number(await a.getByTestId("player").getAttribute("data-x"));assert.ok(blocked>=353&&blocked<=355);await shot("07-cottage-player-collision");
  await move(a,"x",370);await move(a,"y",486);await move(a,"x",480);await enter(a,"town");
  for(let i=0;i<4;i++){await enter(a,"cottage_interior");assert.equal(await a.getByTestId("scene-canvas").getAttribute("data-objects"),cottageObjects);await enter(a,"town");assert.equal(await a.getByTestId("scene-canvas").getAttribute("data-objects"),objects);}
  await a.reload();await expect(a.getByTestId("scene-canvas")).toHaveAttribute("data-ready","true");await expect(a.getByTestId("portal-hint")).toContainText("青篱小居");
  await expect.poll(async()=>{const player=await a.getByTestId("player").boundingBox(),view=await a.getByTestId("scene-viewport").boundingBox();return player.x>=view.x&&player.x+player.width<=view.x+view.width;}).toBe(true);
  await shot("08-new-district-restore");
  await move(a,"y",578);await move(a,"x",1030);await move(a,"y",370);await move(a,"x",1158);await move(a,"y",324);
  for(let i=0;i<3;i++){await enter(a,"store_interior");assert.equal(await a.getByTestId("scene-canvas").getAttribute("data-objects"),storeObjects);await enter(a,"town");}
  assert.deepEqual(await world(),initial);checks.push("从旧广场实际步行到商店和庭院住宅，独立室内与正确出口；床碰撞阻挡；反复进出场景对象数稳定，世界JSON不变");
  performanceResults.artRequests=[...resources];performanceResults.uniqueArtUrls=[...new Set(resources)];performanceResults.note="此快照包含初始加载与一次页面刷新；不是纹理GPU内存或承诺FPS";
  await move(a,"y",370);await move(a,"x",762);await move(a,"y",324);await enter(a,"cafe_interior");await enter(a,"town");
  await move(a,"y",370);await move(a,"x",226);await move(a,"y",324);await enter(a,"home_interior");await enter(a,"town");
  await move(a,"y",370);await move(a,"x",620);await a.getByRole("button",{name:"复位",exact:true}).click();
  await a.getByTestId("npc-aqing").click();await a.getByRole("textbox").fill("你现在在哪里？");await a.getByRole("textbox").press("Enter");await expect(a.getByTestId("reply-source")).toContainText("降级回复");
  const foodBefore=await world();await a.getByRole("button",{name:/送食物/}).click();await expect(a.getByTestId("food-feedback")).toContainText("已保存");assert.equal((await world()).npcs[0].hunger,Math.max(0,foodBefore.npcs[0].hunger-35));
  const auto=await runOne();assert.equal(auto.npcs[0].action,"与邻居闲聊");await shot("09-old-npc-chat-and-running");
  await a.getByRole("button",{name:"放大地图"}).click();await expect(a.getByTestId("speech-bubble")).toBeVisible();await shot("10-bubble-zoom");
  const saved=await world();await stop();await start();assert.deepEqual(await world(),saved);await a.reload();await expect(a.getByTestId("scene-canvas")).toHaveAttribute("data-ready","true");assert.deepEqual(await world(),saved);
  await a.setViewportSize({width:1366,height:768});await a.getByRole("button",{name:"全景",exact:true}).click();await shot("11-overview-1366");assert.ok(await a.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));assert.deepEqual(errors,[]);
  checks.push("原咖啡馆/住宅入口、真实送食物与后续社交、自动推进/暂停、降级聊天/缩放气泡通过；后端重启与刷新保存相等，两个桌面分辨率无横向溢出");
  await context.close();context=null;await rename(await video.path(),`${dir}/east-district-walk.webm`);
  await writeFile(`${dir}/result.json`,JSON.stringify({date:new Date().toISOString(),worldId,checks,screenshots,snapshots,performanceResults,errors,externalModelCalls:0},null,2));console.log(`${checks.length} V8.1 browser groups passed; ${screenshots.length} screenshots and video`);
}catch(e){if(a&&!a.isClosed())await shot("failure");throw e;}
finally{await context?.close();await other?.close();await browser?.close();await stop();log.end();}
