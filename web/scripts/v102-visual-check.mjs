import assert from "node:assert/strict";
import {spawn} from "node:child_process";
import {randomUUID} from "node:crypto";
import {mkdir,writeFile,readFile} from "node:fs/promises";
import {createWriteStream} from "node:fs";
import path from "node:path";
process.env.PLAYWRIGHT_BROWSERS_PATH=path.resolve(".browsers");
const {chromium,expect}=await import("@playwright/test");
if(new URL(process.env.DATABASE_URL||"").pathname!=="/ai_town_mvp_test")throw new Error("仅允许隔离测试库");
const dir=process.env.EVIDENCE_DIR||"evidence/v10-2/before",base="http://127.0.0.1:3117",worldId=`v102-visual-${randomUUID()}`;
await mkdir(dir,{recursive:true});const log=createWriteStream(`${dir}/server.log`,{flags:"a"});
let server,browser,a,context;const screenshots=[];
const delay=ms=>new Promise(r=>setTimeout(r,ms));
const world=async()=>await(await fetch(base+"/api/world")).json();
async function start(){
  server=spawn(process.execPath,["node_modules/next/dist/bin/next","start","--hostname","127.0.0.1","--port","3117"],{windowsHide:true,stdio:["ignore","pipe","pipe"],env:{...process.env,WORLD_ID:worldId,PUBLIC_DEMO:"false",AI_ENABLED:"false",NPC_AI_ENABLED:"false",AI_API_KEY:"",AI_BASE_URL:"",AI_MODEL:""}});
  server.stdout.pipe(log,{end:false});server.stderr.pipe(log,{end:false});
  for(let i=0;i<100;i++){if(server.exitCode!==null)throw new Error("server exited");try{const r=await fetch(base+"/api/world");if(r.ok||r.status===404)return;}catch{}await delay(100);}throw new Error("server timeout");
}
async function stop(){const child=server;server=null;if(child&&child.exitCode===null&&!child.signalCode)await new Promise(r=>{child.once("exit",r);child.kill();});}
async function shot(name,page=a){await page.screenshot({path:`${dir}/${name}.png`,fullPage:true});screenshots.push(name);}
const {database}=await import("../src/lib/store.ts");
try{
  const seed=JSON.parse(await readFile("evidence/v10-2/seed.json","utf8"));seed.run={running:false,nextTickAt:null};
  await database().query("INSERT INTO town_worlds(id,revision,payload) VALUES($1,$2,$3)",[worldId,seed.revision,JSON.stringify(seed)]);
  await start();browser=await chromium.launch({headless:true});context=await browser.newContext({viewport:{width:1440,height:900}});a=await context.newPage();
  const began=performance.now();await a.goto(base);await expect(a.getByTestId("scene-canvas")).toHaveAttribute("data-ready","true");const readyMs=performance.now()-began,objects=await a.getByTestId("scene-canvas").getAttribute("data-objects");await shot("default");
  await a.getByRole("button",{name:"全景",exact:true}).click();await shot("overview");await a.getByRole("button",{name:"复位",exact:true}).click();
  // Real UI camera drag, same world coordinates/scale before and after.
  const frames=[];
  for(const [name,x,y] of [["plaza",520,340],["commercial",1080,330],["housing",2280,380],["riverside",1840,930],["civic",820,820]]){
    await a.getByRole("button",{name:"复位",exact:true}).click();await a.getByRole("button",{name:"缩小地图"}).click();
    const box=await a.getByTestId("scene-viewport").boundingBox();const t=await a.getByTestId("world-plane").evaluate(el=>{const m=new DOMMatrix(getComputedStyle(el).transform);return {s:m.a,x:m.e,y:m.f};});
    const dx=box.width/2-(t.x+x*t.s),dy=box.height/2-(t.y+y*t.s);
    await a.mouse.move(box.x+box.width/2,box.y+box.height-65);await a.mouse.down();await a.mouse.move(box.x+box.width/2+dx,box.y+box.height-65+dy,{steps:12});await a.mouse.up();
    frames.push({name,transform:await a.getByTestId("world-plane").getAttribute("style")});await shot(name);
  }
  if(dir!=="evidence/v10-2/before"){const prior=JSON.parse(await readFile("evidence/v10-2/before/result.json","utf8"));assert.deepEqual(frames,prior.frames);}
  await a.setViewportSize({width:1366,height:768});await a.getByRole("button",{name:"复位",exact:true}).click();await shot("default-1366");assert.ok(await a.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  assert.deepEqual(await world(),(await import("../src/lib/world.ts")).restoreWorld(seed));
  let activity=null;
  if(process.env.V102_ACTIVITY==="true"){
    await a.setViewportSize({width:1440,height:900});await a.getByRole("button",{name:"全景",exact:true}).click();
    const cameraBefore=await a.getByTestId("world-plane").getAttribute("style");
    await a.getByRole("button",{name:"开始自动运行",exact:true}).click();await delay(6500);const running=await world();assert.ok(running.minute>seed.minute);assert.ok(running.npcs.some(n=>n.ongoing));
    assert.equal(await a.getByTestId("world-plane").getAttribute("style"),cameraBefore);await shot("auto-overview");
    await a.getByRole("button",{name:"复位",exact:true}).click();await delay(1200);await shot("auto-local");
    const intervals=await a.evaluate(()=>new Promise(resolve=>{const times=[];let last=performance.now();function frame(now){times.push(now-last);last=now;if(times.length<120)requestAnimationFrame(frame);else resolve(times);}requestAnimationFrame(frame);}));
    await a.getByRole("button",{name:"暂停自动运行",exact:true}).click();await delay(1300);const stopped=await world();await delay(1200);assert.deepEqual(await world(),stopped);
    activity={startMinute:seed.minute,runningMinute:running.minute,stoppedRevision:stopped.revision,cameraPreserved:true,frameIntervalsMs:intervals,npcs:running.npcs.map(n=>({id:n.id,sceneId:n.sceneId,position:n.position,action:n.action}))};
  }
  await writeFile(`${dir}/result.json`,JSON.stringify({worldId,readyMs,objects,seedRevision:seed.revision,frames,screenshots,activity,snapshotUnchangedBeforeAuto:true,paidModelCalls:0},null,2));console.log("visual sample saved",dir);
}finally{await context?.close();await browser?.close();await stop();await database().end();log.end();}
