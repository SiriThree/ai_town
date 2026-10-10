import assert from "node:assert/strict";
import {spawn} from "node:child_process";
import {randomUUID} from "node:crypto";
import {mkdir,writeFile,rename} from "node:fs/promises";
import {createWriteStream} from "node:fs";
import path from "node:path";
process.env.PLAYWRIGHT_BROWSERS_PATH=path.resolve(".browsers");
const {chromium,expect}=await import("@playwright/test");
if(new URL(process.env.DATABASE_URL||"").pathname!=="/ai_town_mvp_test")throw new Error("仅允许隔离测试库");
const dir=process.env.EVIDENCE_DIR||"evidence/v8-v9/v9-final-tour",base="http://127.0.0.1:3116",worldId=`v9-final-tour-browser-${randomUUID()}`;
await mkdir(dir,{recursive:true});const log=createWriteStream(`${dir}/server.log`,{flags:"a"});
let server,browser,a,context,video;const checks=[],errors=[],screenshots=[];
const delay=ms=>new Promise(r=>setTimeout(r,ms));
const world=async()=>await(await fetch(base+"/api/world")).json();
async function start(){
  server=spawn(process.execPath,["node_modules/next/dist/bin/next","start","--hostname","127.0.0.1","--port","3116"],{windowsHide:true,stdio:["ignore","pipe","pipe"],env:{...process.env,WORLD_ID:worldId,PUBLIC_DEMO:"false",AI_ENABLED:"false",NPC_AI_ENABLED:"false",AI_API_KEY:"",AI_BASE_URL:"",AI_MODEL:""}});
  server.stdout.pipe(log,{end:false});server.stderr.pipe(log,{end:false});
  for(let i=0;i<100;i++){if(server.exitCode!==null)throw new Error("server exited");try{const r=await fetch(base+"/api/world");if(r.ok||r.status===404)return;}catch{}await delay(100);}throw new Error("server timeout");
}
async function stop(){const child=server;server=null;if(child&&child.exitCode===null&&!child.signalCode)await new Promise(r=>{child.once("exit",r);child.kill();});}
async function shot(name,page=a){await page.screenshot({path:`${dir}/${name}.png`,fullPage:true});screenshots.push(name);}
async function move(page,axis,target){
  await page.getByTestId("scene-viewport").focus();
  const value=()=>page.getByTestId("player").getAttribute(`data-${axis}`).then(Number);
  let current=await value();
  if(Math.abs(target-current)>12){
    const positive=target>current,key=axis==="x"?(positive?"d":"a"):(positive?"s":"w");await page.keyboard.down(key);
    try{await page.waitForFunction(({axis,target,positive})=>{const v=Number(document.querySelector('[data-testid="player"]').dataset[axis]);return positive?v>=target-10:v<=target+10;},{axis,target,positive},{timeout:30000});}catch(error){throw new Error(`keyboard blocked: ${axis} target ${target}, actual ${await value()}, player ${await page.getByTestId("player").getAttribute("data-x")},${await page.getByTestId("player").getAttribute("data-y")}`,{cause:error});}finally{await page.keyboard.up(key);}
  }
  // Browser keyup crosses a process boundary. Brake and correct at a turn rather than
  // carrying a several-pixel overshoot into the next narrow corridor. No position writes.
  for(let i=0;i<30;i++){
    current=await value();if(Math.abs(target-current)<=1.7)return;
    const positive=target>current,key=axis==="x"?(positive?"d":"a"):(positive?"s":"w");
    await page.keyboard.down(key);await delay(8);await page.keyboard.up(key);await delay(16);
  }
  throw Error(`keyboard alignment ${axis}: target ${target}, actual ${await value()}`);
}
async function enter(page,scene){await page.getByTestId("scene-viewport").focus();await page.keyboard.press("e");await expect(page.getByTestId("scene-canvas")).toHaveAttribute("data-scene",scene);}

const {TOWN_BUILDINGS}=await import("../src/lib/town-map.ts");
const {findScenePath}=await import("../src/lib/navigation.ts");
async function walkTo(end){
  const start={x:Number(await a.getByTestId("player").getAttribute("data-x")),y:Number(await a.getByTestId("player").getAttribute("data-y"))};
  const path=findScenePath("town",start,end);assert.ok(path.length>1,`route exists ${JSON.stringify({start,end})}`);
  for(const p of path.slice(1)){await move(a,"x",p.x);await move(a,"y",p.y);}
}
try{
  await start();browser=await chromium.launch({headless:true});context=await browser.newContext({viewport:{width:1440,height:900},recordVideo:{dir:`${dir}/video`,size:{width:1440,height:900}}});a=await context.newPage();video=a.video();a.on("pageerror",e=>errors.push(e.message));
  await a.goto(base);await expect(a.getByTestId("scene-canvas")).toHaveAttribute("data-ready","true");const initial=await world();
  await a.getByRole("button",{name:"全景",exact:true}).click();await shot("01-full-town");
  await a.getByRole("button",{name:"复位",exact:true}).click();
  for(const id of TOWN_BUILDINGS.map(b=>b.id)){
    const b=TOWN_BUILDINGS.find(b=>b.id===id);await walkTo({x:b.x,y:b.y+17});await shot(`door-${id}`);
    await enter(a,id+"_interior");await shot(`inside-${id}`);
    const objects=await a.getByTestId("scene-canvas").getAttribute("data-objects");
    await move(a,"y",380);await move(a,"y",486);await enter(a,"town");
    for(let repeat=0;repeat<2;repeat++){await enter(a,id+"_interior");assert.equal(await a.getByTestId("scene-canvas").getAttribute("data-objects"),objects);await enter(a,"town");}
  }
  // Return via authored road centres, not a shortest-path zigzag brushing a shop lamp.
  const returnRoute=[{x:2530,y:1234},{x:2530,y:1300},{x:2700,y:1300},{x:2700,y:582},{x:1610,y:582},{x:1610,y:600},{x:1510,y:600},{x:1510,y:580},{x:1030,y:580},{x:1030,y:370},{x:1158,y:370},{x:1158,y:324}];
  assert.ok((await import("../src/lib/scene-data.ts")).validScenePath("town",returnRoute));
  for(const p of returnRoute.slice(1)){await move(a,"x",p.x);await move(a,"y",p.y);}
  await enter(a,"store_interior");await enter(a,"town");
  assert.deepEqual(await world(),initial);checks.push("actual keyboard walk from original street across steps and river bridge to all twelve room types; actual movement, repeated enters/exits and stable scene object counts; original store portal intact");
  await a.setViewportSize({width:1366,height:768});await a.getByRole("button",{name:"全景",exact:true}).click();await shot("02-full-town-1366");
  assert.deepEqual(errors,[]);await context.close();context=null;await rename(await video.path(),`${dir}/interior-walk.webm`);
  await writeFile(`${dir}/result.json`,JSON.stringify({date:new Date().toISOString(),worldId,checks,errors,screenshots,buildings:TOWN_BUILDINGS.length,externalModelCalls:0},null,2));console.log("V9 final twelve interiors browser walkthrough passed");
}catch(e){if(a&&!a.isClosed())await shot("failure");throw e;}finally{await context?.close();await browser?.close();await stop();log.end();}
