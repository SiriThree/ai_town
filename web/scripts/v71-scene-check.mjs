import assert from "node:assert/strict";
import {spawn} from "node:child_process";
import {randomUUID} from "node:crypto";
import {mkdir,writeFile,rename} from "node:fs/promises";
import {createWriteStream} from "node:fs";
import path from "node:path";
process.env.PLAYWRIGHT_BROWSERS_PATH=path.resolve(".browsers");
const {chromium,expect}=await import("@playwright/test");
if(new URL(process.env.DATABASE_URL||"").pathname!=="/ai_town_mvp_test")throw new Error("仅允许隔离测试库");
const dir=process.env.EVIDENCE_DIR||"evidence/v7-1/browser",base="http://127.0.0.1:3113",worldId=`v71-browser-${randomUUID()}`;
await mkdir(dir,{recursive:true});const log=createWriteStream(`${dir}/server.log`,{flags:"a"});
let server,browser,a,b,context,other,video;const checks=[],errors=[],screenshots=[],snapshots=[];
const delay=ms=>new Promise(r=>setTimeout(r,ms));
const world=async()=>await(await fetch(base+"/api/world")).json();
async function start(){
  server=spawn(process.execPath,["node_modules/next/dist/bin/next","start","--hostname","127.0.0.1","--port","3113"],{windowsHide:true,stdio:["ignore","pipe","pipe"],env:{...process.env,WORLD_ID:worldId,PUBLIC_DEMO:"false",AI_ENABLED:"false",AI_API_KEY:"",AI_BASE_URL:"",AI_MODEL:""}});
  server.stdout.pipe(log,{end:false});server.stderr.pipe(log,{end:false});
  for(let i=0;i<100;i++){if(server.exitCode!==null)throw new Error("server exited");try{const r=await fetch(base+"/api/world");if(r.ok||r.status===404)return;}catch{}await delay(100);}throw new Error("server timeout");
}
async function stop(){if(server?.exitCode===null)await new Promise(r=>{server.once("exit",r);server.kill();});}
async function shot(name,page=a){await page.screenshot({path:`${dir}/${name}.png`,fullPage:true});screenshots.push(name);}
async function move(page,axis,target){
  await page.getByTestId("scene-viewport").focus();const value=Number(await page.getByTestId("player").getAttribute(`data-${axis}`)),positive=target>value;
  if(Math.abs(target-value)<=3)return;
  const key=axis==="x"?(positive?"d":"a"):(positive?"s":"w");await page.keyboard.down(key);
  try{await page.waitForFunction(({axis,target,positive})=>{const value=Number(document.querySelector('[data-testid="player"]').dataset[axis]);return positive?value>=target-2:value<=target+2;},{axis,target,positive},{timeout:6000});}finally{await page.keyboard.up(key);}
}
async function enter(page,scene){await page.getByTestId("scene-viewport").focus();await page.keyboard.press("e");await expect(page.getByTestId("scene-canvas")).toHaveAttribute("data-scene",scene);}
async function runOne(){
  const before=await world();await a.getByRole("button",{name:"开始自动运行",exact:true}).click();
  await expect.poll(async()=>(await world()).minute,{timeout:8500}).toBe(before.minute+10);
  await a.getByRole("button",{name:"暂停自动运行",exact:true}).click();await expect(a.getByTestId("run-status")).toContainText("已暂停");
  const after=await world();assert.equal(after.minute,before.minute+10);snapshots.push(after);return after;
}
async function step(){const before=await world();await a.getByRole("button",{name:"推进一步",exact:true}).click();await expect.poll(async()=>(await world()).minute).toBe(before.minute+10);return world();}
async function idle(page,id="aqing"){await expect(page.getByTestId(`npc-${id}`)).toHaveAttribute("data-motion","idle",{timeout:5000});}
try{
  await start();browser=await chromium.launch({headless:true});context=await browser.newContext({viewport:{width:1440,height:900},recordVideo:{dir:`${dir}/video`,size:{width:1440,height:900}}});other=await browser.newContext({viewport:{width:1366,height:768}});
  a=await context.newPage();b=await other.newPage();video=a.video();for(const p of [a,b])p.on("pageerror",e=>errors.push(e.message));
  await a.goto(base);await expect(a.getByTestId("scene-canvas")).toHaveAttribute("data-ready","true");await b.goto(base);await expect(b.getByTestId("scene-canvas")).toHaveAttribute("data-ready","true");
  for(const p of [a,b]){await move(p,"x",762);await move(p,"y",324);}
  await enter(b,"cafe_interior");await move(b,"x",650);await expect(b.getByTestId("npc-aqing")).toHaveCount(0);
  const door=await runOne();assert.equal(door.npcs[0].sceneId,"town");await idle(a);
  assert.deepEqual(door.npcs[0].lastPath,[{x:442,y:368},{x:442,y:358},{x:754,y:358},{x:754,y:324}]);
  await shot("01-npc-at-outdoor-door");await expect(b.getByTestId("npc-aqing")).toHaveCount(0);
  const entered=await runOne();assert.equal(entered.npcs[0].sceneId,"cafe_interior");
  await expect(a.getByTestId("npc-aqing")).toHaveCount(0);await expect(b.getByTestId("npc-aqing")).toBeVisible();await shot("02-outdoor-after-entry");await shot("03-indoor-observer",b);
  assert.equal(entered.events.filter(e=>e.npcId==="aqing"&&e.text.includes("进入麦香")).length,1);
  checks.push("两个独立浏览器分别观察室内外：自动需求决策先走到门口，下个逻辑步合法进入；同一身份仅在真实场景显示，时钟无双倍加速");
  await enter(a,"cafe_interior");await move(a,"x",650);await idle(a);await shot("04-player-follows-npc");
  await a.getByTestId("npc-aqing").click();await expect(a.getByRole("textbox")).toBeEnabled();await a.getByRole("textbox").fill("你现在在哪，正在做什么？");await a.getByRole("textbox").press("Enter");
  await expect(a.getByTestId("reply-source")).toContainText("降级回复");await expect(a.getByTestId("chat-reply")).toContainText("室内");await shot("05-indoor-speech");
  const bubble=await a.getByTestId("speech-bubble").boundingBox(),npc=await a.getByTestId("npc-aqing").boundingBox();assert.ok(bubble.y+bubble.height<=npc.y+2);
  await a.getByRole("textbox").fill("wasd e 草稿保留");const player=await a.getByTestId("player").getAttribute("data-x");await a.getByRole("textbox").press("e");assert.equal(await a.getByTestId("player").getAttribute("data-x"),player);
  await a.getByRole("button",{name:"居民档案",exact:true}).click();await expect(a.getByTestId("profile")).toContainText("室内");await a.getByRole("button",{name:"关闭档案"}).click();
  const saved=await world();await stop();await start();assert.deepEqual(await world(),saved);await a.reload();await expect(a.getByTestId("scene-canvas")).toHaveAttribute("data-ready","true");await expect(a.getByTestId("scene-canvas")).toHaveAttribute("data-scene","cafe_interior");await idle(a);
  await expect(a.getByRole("textbox")).toBeEnabled();await a.getByRole("button",{name:"查看历史",exact:true}).click();await expect(a.getByTestId("chat-turn")).toHaveCount(1);await a.getByRole("button",{name:"关闭历史"}).click();
  const bHistory=await(await b.request.get(base+"/api/npcs/aqing/chat")).json();assert.deepEqual(bHistory.turns,[]);
  checks.push("玩家跟随真实NPC进入；室内档案/气泡/降级对话来自后台场景事实；输入不移动，私聊隔离，后台重启及刷新恢复室内坐标和历史");
  const ate=await step();assert.equal(ate.npcs[0].action,"享用餐点");assert.equal(ate.npcs[0].hunger,33);
  await a.getByRole("textbox").fill("离开后仍保留的草稿");await a.getByRole("button",{name:"查看历史",exact:true}).click();
  const exited=await runOne();assert.equal(exited.npcs[0].sceneId,"town");await expect(a.getByTestId("npc-aqing")).toHaveCount(0);await expect(b.getByTestId("npc-aqing")).toHaveCount(0);await expect(a.getByTestId("speech-bubble")).toHaveCount(0);
  // An NPC leaving while history is open must not leave invisible UI blocking player movement.
  await move(a,"x",480);await enter(a,"town");await idle(a);await expect(a.getByRole("textbox")).toHaveValue("离开后仍保留的草稿");await a.getByRole("button",{name:"关闭历史"}).click();
  await move(a,"y",370);await move(a,"x",840);
  await a.getByRole("textbox").fill("现在在哪里？");await a.getByRole("textbox").press("Enter");await expect(a.getByTestId("chat-reply")).toContainText("室外门口");
  await shot("06-npc-exits-to-outdoor");assert.deepEqual(exited.npcs[0].position,{x:754,y:324});assert.equal(exited.events.filter(e=>e.npcId==="aqing"&&e.text.includes("离开麦香")).length,1);
  const fedBefore=await world();await a.getByRole("button",{name:/送食物/}).click();await expect(a.getByTestId("food-feedback")).toContainText("已保存");assert.equal((await world()).npcs[0].hunger,Math.max(0,fedBefore.npcs[0].hunger-35));
  const outside=await step();assert.equal(outside.npcs[0].location,"square");await expect(a.getByTestId("npc-aqing")).toHaveAttribute("data-motion","walking");
  // A second commit arrives while the first committed route is still being presented.
  await step();await idle(a);const latest=await world();
  const actual=await a.getByTestId("npc-aqing").evaluate(e=>({x:parseFloat(e.style.left),y:parseFloat(e.style.top)}));assert.deepEqual(actual,latest.npcs[0].position);
  checks.push("进食恢复需求后自主离开，同一门口返回、无跨场景插值；打开历史时居民离开不锁住玩家；送食物仍真实写入，连续推进最终表现与后台一致");
  await delay(5400);assert.deepEqual(await world(),latest);await a.reload();await expect(a.getByTestId("scene-canvas")).toHaveAttribute("data-ready","true");assert.deepEqual(await world(),latest);
  await a.setViewportSize({width:1366,height:768});await shot("07-outdoor-1366");assert.ok(await a.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));assert.deepEqual(errors,[]);
  checks.push("暂停后无额外推进；刷新、内外切换、1440×900与1366×768可用，0页面异常，0外部模型调用");
  await context.close();context=null;await rename(await video.path(),`${dir}/npc-cafe-roundtrip.webm`);
  await writeFile(`${dir}/result.json`,JSON.stringify({date:new Date().toISOString(),worldId,checks,snapshots,screenshots,errors,externalModelCalls:0,video:"npc-cafe-roundtrip.webm"},null,2));console.log(`${checks.length} V7.1 browser groups passed; ${screenshots.length} screenshots and video`);
}catch(e){if(a&&!a.isClosed())await shot("failure");throw e;}
finally{await context?.close();await other?.close();await browser?.close();await stop();log.end();}
