import assert from "node:assert/strict";
import {spawn} from "node:child_process";
import {randomUUID} from "node:crypto";
import {mkdir,writeFile,rename} from "node:fs/promises";
import {createWriteStream} from "node:fs";
import {createServer} from "node:http";
import path from "node:path";
process.env.PLAYWRIGHT_BROWSERS_PATH=path.resolve(".browsers");
const {chromium,expect}=await import("@playwright/test");
if(new URL(process.env.DATABASE_URL||"").pathname!=="/ai_town_mvp_test")throw Error("仅隔离测试库");
const {database}=await import("../src/lib/store.ts"),{createWorld,populateResidents}=await import("../src/lib/world.ts");
const {findScenePath}=await import("../src/lib/navigation.ts"),{prepareWork,workPoint}=await import("../src/lib/work.ts");
const dir=process.env.EVIDENCE_DIR||"evidence/v10-life/interaction",id=`v10-interaction-${randomUUID()}`,base="http://127.0.0.1:3120";
await mkdir(dir,{recursive:true});const log=createWriteStream(`${dir}/server.log`);let server,browser,context,a,mode="normal",calls=0;const checks=[],errors=[];
const delay=ms=>new Promise(r=>setTimeout(r,ms));
const model=createServer(async(req,res)=>{let raw="";for await(const b of req)raw+=b;calls++;if(mode==="timeout"){setTimeout(()=>res.end("{}"),6000).unref();return;}
  const input=JSON.parse(raw),facts=JSON.parse(input.messages[0].content.split("世界事实：\n")[1]);res.setHeader("Content-Type","application/json");res.end(JSON.stringify({choices:[{message:{content:`我在${facts.location}，正歇一会儿。`}}]}));});
await new Promise(r=>model.listen(3194,"127.0.0.1",r));
async function get(){return (await fetch(base+"/api/world")).json();}
async function post(route,body){const r=await fetch(base+route,{method:"POST",headers:{"content-type":"application/json",origin:base},body:JSON.stringify(body)});assert.ok(r.ok,await r.clone().text());return r.json();}
async function move(axis,target){await a.getByTestId("scene-viewport").focus();const start=Number(await a.getByTestId("player").getAttribute(`data-${axis}`));if(Math.abs(start-target)<3)return;const positive=target>start,key=axis==="x"?(positive?"d":"a"):(positive?"s":"w");await a.keyboard.down(key);try{await a.waitForFunction(({axis,target,positive})=>{const v=Number(document.querySelector('[data-testid="player"]').dataset[axis]);return positive?v>=target-2:v<=target+2;},{axis,target,positive},{timeout:20000});}finally{await a.keyboard.up(key);}}
async function walk(to){const el=a.getByTestId("player"),scene=await el.getAttribute("data-scene"),from={x:Number(await el.getAttribute("data-x")),y:Number(await el.getAttribute("data-y"))};const route=findScenePath(scene,from,to);assert.ok(route.length>1);for(const p of route.slice(1)){await move("x",p.x);await move("y",p.y);}}
async function pressE(){await a.getByTestId("scene-viewport").focus();await a.keyboard.press("e");}
async function shot(name){await a.screenshot({path:`${dir}/${name}.png`,fullPage:true});}
try{
 const seed=populateResidents(createWorld());seed.run={running:false,nextTickAt:null};for(const n of seed.npcs)Object.assign(n,{hunger:20,energy:85});
 Object.assign(seed.npcs[1],{sceneId:"cafe_interior",location:"cafe",position:{x:500,y:486},action:"稍作停留"});prepareWork(seed);Object.assign(seed.npcs[2],{sceneId:"cafe_interior",location:"cafe",position:workPoint(seed.npcs[2])});
 await database().query("INSERT INTO town_worlds(id,revision,payload) VALUES($1,$2,$3)",[id,seed.revision,JSON.stringify(seed)]);
 server=spawn(process.execPath,["node_modules/next/dist/bin/next","start","--hostname","127.0.0.1","--port","3120"],{windowsHide:true,stdio:["ignore","pipe","pipe"],env:{...process.env,WORLD_ID:id,PUBLIC_DEMO:"false",AI_ENABLED:"true",NPC_AI_ENABLED:"false",AI_API_KEY:"mock",AI_BASE_URL:"http://127.0.0.1:3194/v1",AI_MODEL:"mock",AI_TEST_MODE:"true",AI_TIMEOUT_MS:"2500",AI_CALLS_PER_DAY:"12"}});server.stdout.pipe(log,{end:false});server.stderr.pipe(log,{end:false});
 for(let i=0;i<100;i++){try{if((await fetch(base+"/api/world")).ok)break;}catch{}await delay(100);}
 browser=await chromium.launch({headless:true});context=await browser.newContext({viewport:{width:1440,height:900},recordVideo:{dir,size:{width:1440,height:900}}});a=await context.newPage();a.on("pageerror",e=>errors.push(e.message));await a.goto(base);await expect(a.getByTestId("scene-canvas")).toHaveAttribute("data-ready","true");
 const qingBox=await a.getByTestId("npc-aqing").boundingBox();await a.mouse.click(qingBox.x+qingBox.width/2,qingBox.y+qingBox.height/2);await expect(a.getByTestId("profile")).toBeVisible();await expect(a.getByTestId("scene-composer")).toHaveCount(0);await a.keyboard.press("Escape");
 // Stand southwest of Aqing, away from the overlapping initial six-resident cluster.
 await walk({x:420,y:390});await expect(a.getByTestId("interaction-hint")).toHaveAttribute("data-target","aqing");await shot("01-nearby");await pressE();await expect(a.getByTestId("scene-composer")).toBeVisible();await expect(a.getByTestId("interaction-feedback")).toContainText("正在与阿晴交谈");
 const beforeInput=await a.getByTestId("player").getAttribute("data-x");await a.locator("textarea").fill("wasde");await a.locator("textarea").press("e");assert.equal(await a.getByTestId("player").getAttribute("data-x"),beforeInput);await a.locator("textarea").fill("你现在在哪里？");await a.getByRole("button",{name:"发送消息",exact:true}).click();await expect(a.getByTestId("reply-source")).toContainText("本地测试替身");await shot("02-ai-substitute");
 checks.push("mouse profile only; walk near E opens one chat; input isolates movement/door; actual HTTP reply source identified");
 mode="timeout";await a.locator("textarea").fill("等一会儿能回答吗？");await a.getByRole("button",{name:"发送消息",exact:true}).click();await expect(a.getByText(/阿晴正在想一想/)).toBeVisible();
 const waitingWorld=await get(),intervenedAt=performance.now();const fed=await post("/api/world/interventions",{action:"feed",npcId:"xiaoman",expectedRevision:waitingWorld.revision});assert.equal(fed.npcs.find(n=>n.id==="xiaoman").hunger,0);assert.ok(performance.now()-intervenedAt<2000,"world mutation must not wait for model timeout");
 await a.getByTestId("scene-viewport").focus();await a.keyboard.down("a");await delay(180);await a.keyboard.up("a");assert.notEqual(await a.getByTestId("player").getAttribute("data-x"),beforeInput);
 await a.getByRole("button",{name:"全景",exact:true}).click();await a.getByRole("button",{name:"复位",exact:true}).click();await expect(a.getByTestId("reply-source")).toContainText("模型响应超时",{timeout:6000});await shot("03-timeout-responsive");
 const visitorB=await browser.newContext();const other=await visitorB.request.get(base+"/api/npcs/aqing/chat");assert.equal((await other.json()).turns.length,0);await visitorB.close();
 const saved=await context.request.get(base+"/api/npcs/aqing/chat");assert.equal((await saved.json()).turns.length,2);
 await a.keyboard.press("Escape");await expect(a.getByTestId("scene-composer")).toHaveCount(0);await walk({x:880,y:358});await expect(a.getByTestId("interaction-hint")).toHaveAttribute("data-kind","notice");await pressE();await expect(a.getByRole("dialog")).toBeVisible();await shot("04-real-notice");await a.keyboard.press("Escape");
 checks.push("2500ms model timeout leaves WASD/camera responsive; fallback and visitor isolation; existing board opens actual world log");
 await walk({x:762,y:324});await expect(a.getByTestId("portal-hint")).toContainText("麦香咖啡馆");await pressE();await expect(a.getByTestId("scene-canvas")).toHaveAttribute("data-scene","cafe_interior");
 await walk({x:500,y:462});await expect(a.getByTestId("interaction-hint")).toHaveAttribute("data-target","aning");mode="normal";await pressE();await expect(a.getByTestId("scene-composer")).toContainText("阿宁");await a.locator("textarea").fill("你现在在哪？");await a.getByRole("button",{name:"发送消息",exact:true}).click();await expect(a.getByTestId("chat-reply")).toContainText("室内");await shot("05-indoor-chat");await a.keyboard.press("Escape");
 // Start a genuine work action without time for completion, then walk near its busy worker.
 let current=await get();await post("/api/world/tick",{expectedRevision:current.revision});await walk({x:520,y:320});await expect(a.getByTestId("interaction-hint")).toHaveAttribute("data-target","xiaoyu");await pressE();await expect(a.getByTestId("interaction-feedback")).toContainText("忙手边的事");await expect(a.getByTestId("scene-composer")).toHaveCount(0);await shot("06-busy-work");
 await a.keyboard.press("Escape");await walk({x:480,y:494});await expect(a.getByTestId("portal-hint")).toBeVisible();await pressE();await expect(a.getByTestId("scene-canvas")).toHaveAttribute("data-scene","town");
 current=await get();assert.equal(current.minute,seed.minute+2);assert.equal(current.npcs[2].workTask.progress,0);assert.ok(current.npcs[2].ongoing);
 await a.reload();await expect(a.getByTestId("scene-canvas")).toHaveAttribute("data-ready","true");assert.equal((await get()).revision,current.revision);await shot("07-return-and-reload");
 assert.deepEqual(errors,[]);checks.push("indoor real NPC conversation; door/NPC choice single target; uninterruptible worker busy; exit and paused reload preserve world");
 const video=a.video();await context.close();context=null;await rename(await video.path(),`${dir}/nearby-interaction.webm`);await writeFile(`${dir}/result.json`,JSON.stringify({id,checks,errors,calls,externalPaidCalls:0},null,2));console.log("V10 interaction passed",checks);
}catch(e){if(a&&!a.isClosed())await shot("failure");throw e;}finally{await context?.close();await browser?.close();if(server&&server.exitCode===null&&!server.signalCode)await new Promise(r=>{server.once("exit",r);server.kill();});model.closeAllConnections();await new Promise(r=>model.close(r));await database().end();log.end();}
