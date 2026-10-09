import assert from "node:assert/strict";
import {spawn} from "node:child_process";
import {randomUUID} from "node:crypto";
import {mkdir,writeFile,rename} from "node:fs/promises";
import {createWriteStream} from "node:fs";
import path from "node:path";
import {database} from "../src/lib/store.ts";
import {createWorld,assertWorld} from "../src/lib/world.ts";
process.env.PLAYWRIGHT_BROWSERS_PATH=path.resolve(".browsers");
const {chromium,expect}=await import("@playwright/test");
if(new URL(process.env.DATABASE_URL||"").pathname!=="/ai_town_mvp_test")throw new Error("仅允许隔离测试库");
const dir=process.env.EVIDENCE_DIR||"evidence/v7-2/browser",base="http://127.0.0.1:3114",worldId=`v72-browser-${randomUUID()}`;
await mkdir(dir,{recursive:true});const log=createWriteStream(`${dir}/server.log`,{flags:"a"});
let server,browser,a,b,context,other,video;const checks=[],errors=[],screenshots=[],snapshots=[];
const delay=ms=>new Promise(r=>setTimeout(r,ms));
const world=async()=>await(await fetch(base+"/api/world")).json();
async function start(){
  server=spawn(process.execPath,["node_modules/next/dist/bin/next","start","--hostname","127.0.0.1","--port","3114"],{windowsHide:true,stdio:["ignore","pipe","pipe"],env:{...process.env,WORLD_ID:worldId,PUBLIC_DEMO:"false",AI_ENABLED:"false",AI_API_KEY:"",AI_BASE_URL:"",AI_MODEL:""}});
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
async function idle(page,id="aning"){await expect(page.getByTestId(`npc-${id}`)).toHaveAttribute("data-motion","idle",{timeout:5000});}
try{
  const seed=createWorld();Object.assign(seed.npcs[1],{hunger:0,energy:8});assertWorld(seed);
  await database().query("INSERT INTO town_worlds(id,revision,payload) VALUES($1,0,$2)",[worldId,JSON.stringify(seed)]);await database().end();
  await start();browser=await chromium.launch({headless:true});context=await browser.newContext({viewport:{width:1440,height:900},recordVideo:{dir:`${dir}/video`,size:{width:1440,height:900}}});other=await browser.newContext({viewport:{width:1366,height:768}});
  a=await context.newPage();b=await other.newPage();video=a.video();for(const p of [a,b])p.on("pageerror",e=>errors.push(e.message));
  for(const p of [a,b]){await p.goto(base);await expect(p.getByTestId("scene-canvas")).toHaveAttribute("data-ready","true");}
  // Both original cafe portals remain usable, before exercising the home portals.
  await move(b,"x",762);await move(b,"y",324);await enter(b,"cafe_interior");await shot("00-cafe-regression",b);await enter(b,"town");await move(b,"y",370);
  for(const p of [a,b]){await move(p,"x",226);await move(p,"y",324);}
  await shot("01-outdoor-home");await enter(a,"home_interior");await shot("02-home-interior");
  const objectCount=await a.getByTestId("scene-canvas").getAttribute("data-objects");
  // Walk to the left bed's neighbour and hold toward its solid foot area.
  await move(a,"y",400);await move(a,"x",370);await move(a,"y",300);await a.keyboard.down("a");await delay(700);await a.keyboard.up("a");
  const blocked=Number(await a.getByTestId("player").getAttribute("data-x"));assert.ok(blocked>=353&&blocked<=355);await shot("03-player-bed-collision");
  await move(a,"x",370);await move(a,"y",486);await move(a,"x",480);await enter(a,"town");
  for(let i=0;i<2;i++){await enter(a,"home_interior");assert.equal(await a.getByTestId("scene-canvas").getAttribute("data-objects"),objectCount);await enter(a,"town");}
  assert.deepEqual(await world(),seed);checks.push("真实键盘进出咖啡馆与住宅、重复切换无对象增加；床碰撞阻挡，场景切换不改变世界");
  await enter(b,"home_interior");await move(b,"x",550);
  const door=await runOne();assert.equal(door.npcs[1].sceneId,"town");assert.deepEqual(door.npcs[1].position,{x:234,y:324});await idle(a);await shot("04-npc-home-door");await expect(b.getByTestId("npc-aning")).toHaveCount(0);
  const entered=await runOne();assert.equal(entered.npcs[1].sceneId,"home_interior");await expect(a.getByTestId("npc-aning")).toHaveCount(0);await expect(b.getByTestId("npc-aning")).toBeVisible();await shot("05-npc-enters-home",b);await expect(b.getByTestId("npc-aqing")).toHaveCount(0);assert.equal(entered.npcs[0].sceneId,"cafe_interior");
  await enter(a,"home_interior");await move(a,"x",550);await shot("06-player-follows-home");
  const bed=await runOne();assert.equal(bed.npcs[1].action,"走到暖灯小屋床边");await expect(a.getByTestId("npc-aning")).toHaveAttribute("data-motion","walking");await shot("07-indoor-walking");await idle(a);
  const rest=await step();assert.equal(rest.npcs[1].action,"在床边休息");assert.equal(rest.npcs[1].energy,40);await idle(a);await expect(a.getByTestId("npc-aning")).toHaveAttribute("data-facing","east");await shot("08-npc-resting");
  checks.push("低精力阿宁沿后台室外路径到住宅门前，再经入口进入；独立观察者只在正确场景看到同一身份，真实室内路径到床边后恢复精力40");
  await a.getByTestId("npc-aning").click();await a.getByRole("textbox").fill("你现在在哪，正在做什么？");await a.getByRole("textbox").press("Enter");
  await expect(a.getByTestId("reply-source")).toContainText("降级回复");await expect(a.getByTestId("chat-reply")).toContainText("暖灯小屋 · 室内");await expect(a.getByTestId("chat-reply")).toContainText("在床边休息");await shot("09-home-conversation");
  await a.getByRole("button",{name:"居民档案",exact:true}).click();await expect(a.getByTestId("profile")).toContainText("精力");await shot("10-npc-profile");await a.getByRole("button",{name:"关闭档案"}).click();
  await a.getByRole("textbox").fill("wasd e 保留的草稿");const hero=await a.getByTestId("player").getAttribute("data-x");await a.getByRole("textbox").press("e");assert.equal(await a.getByTestId("player").getAttribute("data-x"),hero);
  const privateHistory=await(await b.request.get(base+"/api/npcs/aning/chat")).json();assert.deepEqual(privateHistory.turns,[]);
  const saved=await world();await stop();await start();assert.deepEqual(await world(),saved);await a.reload();await expect(a.getByTestId("scene-canvas")).toHaveAttribute("data-ready","true");await expect(a.getByTestId("scene-canvas")).toHaveAttribute("data-scene","home_interior");await idle(a);
  await a.getByRole("button",{name:"查看历史",exact:true}).click();await expect(a.getByTestId("chat-turn")).toHaveCount(1);await a.getByRole("button",{name:"关闭历史"}).click();
  const fedBefore=await world();await a.getByRole("button",{name:/送食物/}).click();await expect(a.getByTestId("food-feedback")).toContainText("已保存");assert.equal((await world()).npcs[1].hunger,Math.max(0,fedBefore.npcs[1].hunger-35));
  checks.push("住宅真实NPC可选中、查看状态和降级聊天；输入不误移动，私聊隔离；后端重启及页面刷新保留床边状态、朝向、会话历史；送食物仍写入后台");
  const recovered=await step();assert.equal(recovered.npcs[1].energy,74);
  await a.getByRole("textbox").fill("移动时保留草稿");await a.getByRole("button",{name:"放大地图"}).click();const camera=await a.getByTestId("world-plane").getAttribute("style");
  const exitPath=await runOne();assert.equal(exitPath.npcs[1].sceneId,"home_interior");assert.equal(exitPath.npcs[1].action,"走到暖灯小屋出口");await expect(a.getByTestId("npc-aning")).toHaveAttribute("data-motion","walking");await shot("11-exit-walk-bubble");await idle(a);assert.equal(await a.getByTestId("world-plane").getAttribute("style"),camera);await expect(a.getByRole("textbox")).toHaveValue("移动时保留草稿");
  await a.getByRole("button",{name:"复位",exact:true}).click();await a.getByRole("button",{name:"查看历史",exact:true}).click();
  const exited=await runOne();assert.equal(exited.npcs[1].sceneId,"town");assert.deepEqual(exited.npcs[1].position,{x:234,y:324});for(const p of [a,b])await expect(p.getByTestId("npc-aning")).toHaveCount(0);await expect(a.getByTestId("speech-bubble")).toHaveCount(0);
  await move(a,"x",480);await enter(a,"town");await idle(a);await a.getByRole("button",{name:"关闭历史"}).click();await shot("12-npc-outside-after-rest");
  await move(b,"x",480);await enter(b,"town");await idle(b);await shot("13-outdoor-1366",b);
  const away=await step();assert.equal(away.npcs[1].location,"square");await step();await idle(a);const final=await world();await delay(5400);assert.deepEqual(await world(),final);
  await a.reload();await expect(a.getByTestId("scene-canvas")).toHaveAttribute("data-ready","true");assert.deepEqual(await world(),final);
  assert.equal(exited.events.filter(e=>e.npcId==="aning"&&e.text.includes("进入暖灯")).length,1);assert.equal(exited.events.filter(e=>e.npcId==="aning"&&e.text.includes("离开暖灯")).length,1);
  assert.ok(await b.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));assert.deepEqual(errors,[]);
  checks.push("恢复精力后自主走到出口再离开；移动气泡跟随且镜头/草稿保留，历史打开期间离开不锁住玩家；双访客时钟不加速，连续手动推进与暂停正常，两种桌面分辨率0页面异常");
  await context.close();context=null;await rename(await video.path(),`${dir}/npc-home-roundtrip.webm`);
  await writeFile(`${dir}/result.json`,JSON.stringify({date:new Date().toISOString(),worldId,checks,snapshots,screenshots,errors,blockedPlayerX:blocked,externalModelCalls:0,video:"npc-home-roundtrip.webm"},null,2));console.log(`${checks.length} V7.2 browser groups passed; ${screenshots.length} screenshots and video`);
}catch(e){if(a&&!a.isClosed())await shot("failure");throw e;}
finally{await context?.close();await other?.close();await browser?.close();await stop();log.end();}
