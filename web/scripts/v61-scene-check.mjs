import assert from "node:assert/strict";
import {spawn} from "node:child_process";
import {randomUUID} from "node:crypto";
import {mkdir,writeFile,rename} from "node:fs/promises";
import {createWriteStream} from "node:fs";
import path from "node:path";
process.env.PLAYWRIGHT_BROWSERS_PATH=path.resolve(".browsers");
const {chromium,expect}=await import("@playwright/test");
if(new URL(process.env.DATABASE_URL||"").pathname!=="/ai_town_mvp_test")throw new Error("仅允许隔离测试库");
const dir=process.env.EVIDENCE_DIR||"evidence/v6-1/scene",base="http://127.0.0.1:3112",worldId=`v61-${randomUUID()}`;
await mkdir(dir,{recursive:true});const log=createWriteStream(`${dir}/server.log`,{flags:"a"});
let server,browser,context,page,video;const checks=[],trace=[],errors=[],shots=[];
const delay=ms=>new Promise(r=>setTimeout(r,ms));
const world=async()=>await(await fetch(base+"/api/world")).json();
async function start(){
  server=spawn(process.execPath,["node_modules/next/dist/bin/next","start","--hostname","127.0.0.1","--port","3112"],{windowsHide:true,stdio:["ignore","pipe","pipe"],env:{...process.env,WORLD_ID:worldId,PUBLIC_DEMO:"false",AI_ENABLED:"false",AI_API_KEY:"",AI_BASE_URL:"",AI_MODEL:"",NEXT_TELEMETRY_DISABLED:"1"}});
  server.stdout.pipe(log,{end:false});server.stderr.pipe(log,{end:false});
  for(let i=0;i<100;i++){if(server.exitCode!==null)throw new Error("server exited");try{const r=await fetch(base+"/api/world");if(r.ok||r.status===404)return;}catch{}await delay(100);}throw new Error("server timeout");
}
async function stop(){if(server?.exitCode===null)await new Promise(r=>{server.once("exit",r);server.kill();});}
const pos=async()=>page.getByTestId("player").evaluate(e=>({x:Number(e.dataset.x),y:Number(e.dataset.y),sceneId:e.dataset.scene,motion:e.dataset.motion,facing:e.dataset.facing}));
const focus=()=>page.getByTestId("scene-viewport").focus();
async function move(axis,target){
  await focus();const before=await pos(),positive=target>before[axis],key=axis==="x"?(positive?"d":"a"):(positive?"s":"w");
  if(Math.abs(target-before[axis])<=3)return;
  await page.keyboard.down(key);
  try{await page.waitForFunction(({axis,target,positive})=>{const e=document.querySelector('[data-testid="player"]');const n=Number(e.dataset[axis]);return positive?n>=target-2:n<=target+2;},{axis,target,positive},{timeout:6500});}
  finally{await page.keyboard.up(key);}
  trace.push({action:`move ${axis} ${target}`,position:await pos()});
}
async function pressE(expected){await focus();await page.keyboard.press("e");await expect(page.getByTestId("scene-canvas")).toHaveAttribute("data-scene",expected);await expect(page.getByTestId("player")).toHaveAttribute("data-motion","idle");}
async function shot(name){await page.screenshot({path:`${dir}/${name}.png`,fullPage:true});shots.push(name);}
async function collision(key,minimum,axis="y"){
  await focus();await page.keyboard.down(key);await delay(1200);await page.keyboard.up(key);const stopped=await pos();
  await page.keyboard.down(key);await delay(350);await page.keyboard.up(key);const after=await pos();
  // Collision substeps are <=2 world units. A later shorter frame can close the remaining subpixel gap.
  assert.ok(Math.abs(after[axis]-stopped[axis])<=2);assert.ok(after[axis]>=minimum&&after[axis]<=minimum+2);
  trace.push({action:`collision ${key}`,position:after});return after;
}
try{
  await start();browser=await chromium.launch({headless:true});context=await browser.newContext({viewport:{width:1440,height:900},recordVideo:{dir:`${dir}/video`,size:{width:1440,height:900}}});page=await context.newPage();video=page.video();page.on("pageerror",e=>errors.push(e.message));
  await page.goto(base);await expect(page.getByTestId("scene-canvas")).toHaveAttribute("data-ready","true");const initial=await world();await shot("01-outdoor-avatar");
  await focus();await page.keyboard.press("e");assert.equal((await pos()).sceneId,"town");
  await move("x",762);await move("y",319);await expect(page.getByTestId("portal-hint")).toContainText("进入");await shot("02-cafe-door");
  await collision("w",309);await pressE("cafe_interior");const insideCount=await page.getByTestId("scene-canvas").getAttribute("data-objects");
  assert.equal(await page.locator('[data-testid^="npc-"]').count(),0);await shot("03-interior-complete");
  assert.deepEqual(await world(),initial);checks.push("通过真实WASD从安全出生点走到咖啡馆；远处E无效、房屋阻挡，门口E进入独立场景，世界不重置");
  await move("y",391);await move("x",320);await collision("w",376);await shot("04-furniture-collision");
  await move("x",480);await move("y",280);await collision("w",175);await shot("05-wall-collision");
  await move("y",390);const saved=await pos();await page.reload();await expect(page.getByTestId("scene-canvas")).toHaveAttribute("data-ready","true");assert.equal((await pos()).sceneId,"cafe_interior");assert.equal((await pos()).x,saved.x);assert.equal((await pos()).y,saved.y);assert.deepEqual(await world(),initial);
  checks.push("室内桌椅和北墙碰撞；走动/转向/停止；刷新恢复当前标签页安全位置，不修改NPC存档");
  await move("y",486);await pressE("town");const outdoorCount=await page.getByTestId("scene-canvas").getAttribute("data-objects");assert.equal((await pos()).x,762);assert.equal((await pos()).y,324);await shot("06-return-outdoor");
  await page.getByRole("button",{name:"放大地图"}).click();const beforeCamera=await page.getByTestId("world-plane").getAttribute("style");
  for(let i=0;i<3;i++){await pressE("cafe_interior");assert.equal(await page.getByTestId("scene-canvas").getAttribute("data-objects"),insideCount);await pressE("town");assert.equal(await page.getByTestId("scene-canvas").getAttribute("data-objects"),outdoorCount);assert.equal(await page.locator("canvas").count(),1);}
  assert.equal(await page.getByTestId("world-plane").getAttribute("style"),beforeCamera);await page.getByRole("button",{name:"复位",exact:true}).click();checks.push("反复进出只挂载一个场景树/一个canvas；室外镜头独立保留，返回精确门口安全坐标");
  await page.getByTestId("npc-aqing").click();await expect(page.getByRole("textbox")).toBeEnabled();const beforeInput=await pos();await page.getByRole("textbox").fill("wasd e 你现在在干什么？");await page.getByRole("textbox").press("ArrowLeft");await page.getByRole("textbox").press("e");await delay(150);assert.deepEqual(await pos(),beforeInput);
  await page.getByRole("textbox").fill("你现在在干什么？");await page.getByRole("textbox").press("Enter");await expect(page.getByTestId("reply-source")).toContainText("降级回复");await page.getByRole("textbox").fill("回来后继续聊的草稿");await shot("07-preserved-chat");
  await page.getByRole("button",{name:"放大地图"}).click();await pressE("cafe_interior");await expect(page.getByRole("textbox")).toBeHidden();assert.equal(await page.getByTestId("speech-bubble").count(),0);
  await page.getByRole("button",{name:"开始自动运行"}).click();await expect.poll(async()=>(await world()).minute,{timeout:8500}).toBeGreaterThan(initial.minute);await page.getByRole("button",{name:"暂停自动运行"}).click();await expect(page.getByTestId("run-status")).toContainText("已暂停");const paused=await world();await shot("08-interior-world-running-state");
  await pressE("town");await expect(page.getByRole("textbox")).toHaveValue("回来后继续聊的草稿");await expect(page.getByTestId("speech-bubble")).toBeVisible();await expect(page.getByTestId("npc-aqing")).toHaveAttribute("data-motion","idle");
  const npc=await page.getByTestId("npc-aqing").evaluate(e=>({x:Number.parseFloat(e.style.left),y:Number.parseFloat(e.style.top)}));assert.deepEqual(npc,paused.npcs[0].position);
  await page.getByRole("button",{name:"查看历史",exact:true}).click();await expect(page.getByTestId("chat-turn")).toHaveCount(1);await page.getByRole("button",{name:"关闭历史"}).click();
  await delay(5500);assert.deepEqual(await world(),paused);checks.push("输入焦点屏蔽移动键；内外切换保留聊天草稿/私聊历史，室内无假居民和气泡；室内自动推进继续、暂停正常，返回使用真实最新NPC坐标");
  const beforeFood=await world();await page.getByRole("button",{name:/送食物/}).click();await expect(page.getByTestId("food-feedback")).toContainText("已保存");const fed=await world();assert.equal(fed.npcs[0].hunger,Math.max(0,beforeFood.npcs[0].hunger-35));
  await page.getByRole("button",{name:"推进一步"}).click();await expect.poll(async()=>(await world()).minute).toBe(fed.minute+10);const committed=await world();
  await stop();await start();assert.deepEqual(await world(),committed);await page.reload();await expect(page.getByTestId("scene-canvas")).toHaveAttribute("data-ready","true");await expect(page.getByRole("textbox")).toBeEnabled();await page.getByRole("button",{name:"查看历史",exact:true}).click();await expect(page.getByTestId("chat-turn")).toHaveCount(1);await page.getByRole("button",{name:"关闭历史"}).click();checks.push("送食物与手动推进写真实PG；重启后台+刷新完整恢复推进后存档和访客私聊");
  await page.setViewportSize({width:1366,height:768});await page.getByRole("button",{name:"复位",exact:true}).click();await pressE("cafe_interior");await shot("09-interior-1366");await pressE("town");await shot("10-outdoor-1366");assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  // Only this explicit corrupt-state fixture touches storage. All core journeys above use real keyboard input.
  await page.addInitScript(()=>sessionStorage.setItem("morning-town:player:v1",JSON.stringify({version:1,sceneId:"cafe_interior",position:{x:320,y:340},facing:"south"})));
  await page.reload();await expect(page.getByTestId("scene-canvas")).toHaveAttribute("data-ready","true");assert.deepEqual((({x,y,sceneId})=>({x,y,sceneId}))(await pos()),{x:480,y:486,sceneId:"cafe_interior"});checks.push("两种桌面分辨率；非法/家具内浏览器位置恢复到安全门口");
  assert.deepEqual(errors,[]);await context.close();context=null;await rename(await video.path(),`${dir}/cafe-enter-walk-exit.webm`);
  await writeFile(`${dir}/result.json`,JSON.stringify({date:new Date().toISOString(),worldId,checks,trace,screenshots:shots,errors,externalModelCalls:0,video:"cafe-enter-walk-exit.webm",objectCounts:{town:outdoorCount,cafe_interior:insideCount}},null,2));console.log(`${checks.length} V6.1 browser groups passed; ${shots.length} screenshots and actual video.`);
}catch(e){if(page&&!page.isClosed())await shot("failure");throw e;}
finally{await context?.close();await browser?.close();await stop();log.end();}

