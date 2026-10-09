import assert from "node:assert/strict";
import {spawn} from "node:child_process";
import {randomUUID} from "node:crypto";
import {mkdir,writeFile,rename} from "node:fs/promises";
import {createWriteStream} from "node:fs";
import path from "node:path";
process.env.PLAYWRIGHT_BROWSERS_PATH=path.resolve(".browsers");
const {chromium,expect}=await import("@playwright/test");
if(new URL(process.env.DATABASE_URL||"").pathname!=="/ai_town_mvp_test")throw new Error("仅允许隔离测试库");
const dir=process.env.EVIDENCE_DIR||"evidence/v8-v9/v84",base="http://127.0.0.1:3115",worldId=`v84-browser-${randomUUID()}`;
await mkdir(dir,{recursive:true});const log=createWriteStream(`${dir}/server.log`,{flags:"a"});
let server,browser,a,context,video;const checks=[],errors=[],screenshots=[];
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
  try{await page.waitForFunction(({axis,target,positive})=>{const value=Number(document.querySelector('[data-testid="player"]').dataset[axis]);return positive?value>=target-2:value<=target+2;},{axis,target,positive},{timeout:30000});}catch(error){console.error({axis,target,value,actual:await page.getByTestId("player").getAttribute(`data-${axis}`)});throw error;}finally{await page.keyboard.up(key);}
}
async function enter(page,scene){await page.getByTestId("scene-viewport").focus();await page.keyboard.press("e");await expect(page.getByTestId("scene-canvas")).toHaveAttribute("data-scene",scene);}

const {TOWN_BUILDINGS}=await import("../src/lib/town-map.ts");
const {findScenePath}=await import("../src/lib/navigation.ts");
async function walkTo(end){
  const start={x:Number(await a.getByTestId("player").getAttribute("data-x")),y:Number(await a.getByTestId("player").getAttribute("data-y"))};
  const path=findScenePath("town",start,end);assert.ok(path.length>1,`route exists ${JSON.stringify({start,end})}`);
  for(const p of path.slice(1)){await move(a,"x",p.x);await move(a,"y",p.y);}
}

async function frames(){return a.evaluate(()=>new Promise(resolve=>{let last=0;const dt=[];function frame(t){if(last)dt.push(t-last);last=t;if(dt.length<90)requestAnimationFrame(frame);else{const sorted=[...dt].sort((x,y)=>x-y);resolve({samples:90,meanMs:dt.reduce((x,y)=>x+y)/90,p95Ms:sorted[85]});}}requestAnimationFrame(frame);}));}
const metrics={};
try{
  await start();browser=await chromium.launch({headless:true});context=await browser.newContext({viewport:{width:1440,height:900},recordVideo:{dir:`${dir}/video`,size:{width:1440,height:900}}});a=await context.newPage();video=a.video();a.on("pageerror",e=>errors.push(e.message));
  const began=performance.now();await a.goto(base);await expect(a.getByTestId("scene-canvas")).toHaveAttribute("data-ready","true");metrics.initialReadyMs=performance.now()-began;const initial=await world();
  const cdp=await context.newCDPSession(a);await cdp.send("Performance.enable");
  const heap=async()=>Object.fromEntries((await cdp.send("Performance.getMetrics")).metrics.filter(m=>["JSHeapUsedSize","Nodes","Documents","JSEventListeners"].includes(m.name)).map(m=>[m.name,m.value]));
  metrics.before=await heap();metrics.idle=await frames();metrics.outdoorObjects=await a.getByTestId("scene-canvas").getAttribute("data-objects");
  await a.getByRole("button",{name:"全景",exact:true}).click();await shot("01-town-1440");
  await a.setViewportSize({width:1366,height:768});await a.getByRole("button",{name:"全景",exact:true}).click();await shot("02-town-1366");assert.ok(await a.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await a.setViewportSize({width:1440,height:900});
  await a.getByRole("button",{name:"复位",exact:true}).click();const walking=walkTo({x:1158,y:324});metrics.walking=await frames();await walking;
  const timings=[];let count;for(let i=0;i<24;i++){const start=performance.now();await enter(a,"store_interior");timings.push(performance.now()-start);const n=await a.getByTestId("scene-canvas").getAttribute("data-objects");if(count)assert.equal(n,count);count=n;if(i===0)await shot("03-store-interior");await enter(a,"town");assert.equal(await a.getByTestId("scene-canvas").getAttribute("data-objects"),metrics.outdoorObjects);}
  metrics.switchMs={samples:timings.length,mean:timings.reduce((s,t)=>s+t)/timings.length,max:Math.max(...timings)};metrics.after=await heap();await cdp.send("HeapProfiler.collectGarbage");metrics.afterGC=await heap();
  for(let i=0;i<24;i++){await enter(a,"store_interior");await enter(a,"town");assert.equal(await a.getByTestId("scene-canvas").getAttribute("data-objects"),metrics.outdoorObjects);}
  await cdp.send("HeapProfiler.collectGarbage");metrics.secondBatchGC=await heap();
  await writeFile(`${dir}/heap-sample.json`,JSON.stringify(metrics,null,2));
  assert.ok(metrics.secondBatchGC.JSHeapUsedSize<metrics.afterGC.JSHeapUsedSize+8*1024*1024,"retained heap must not grow by more than 8MiB in a second 24-roundtrip sample");
  metrics.note="Chromium headless; JS heap includes garbage awaiting collection; bounded sample, not long-duration leak proof or GPU draw time";
  assert.deepEqual(await world(),initial);const saved=await world();await stop();await start();assert.deepEqual(await world(),saved);await a.reload();await expect(a.getByTestId("scene-canvas")).toHaveAttribute("data-ready","true");
  await walkTo({x:620,y:370});await a.getByRole("button",{name:"复位",exact:true}).click();await a.getByTestId("npc-aqing").click();await a.getByRole("textbox").fill("你现在在哪里？");await a.getByRole("textbox").press("Enter");await expect(a.getByTestId("reply-source")).toContainText("降级回复");await shot("04-original-npc-chat");
  assert.deepEqual(errors,[]);checks.push("two desktop sizes, real walking, 24 scene round trips with stable object counts, heap/frame/switch metrics, backend restart full snapshot, original NPC Fallback bubble");
  await context.close();context=null;await rename(await video.path(),`${dir}/v8-experience.webm`);await writeFile(`${dir}/result.json`,JSON.stringify({date:new Date().toISOString(),worldId,checks,metrics,screenshots,errors,buildings:TOWN_BUILDINGS.length,externalModelCalls:0},null,2));console.log("V8.4 performance and stability passed",JSON.stringify(metrics));
}catch(e){if(a&&!a.isClosed())await shot("failure");throw e;}finally{await context?.close();await browser?.close();await stop();log.end();}
