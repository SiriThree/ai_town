import assert from "node:assert/strict";
import {spawn} from "node:child_process";
import {randomUUID} from "node:crypto";
import {mkdir,writeFile,rename} from "node:fs/promises";
import {createWriteStream} from "node:fs";
import path from "node:path";
process.env.PLAYWRIGHT_BROWSERS_PATH=path.resolve(".browsers");
const {chromium,expect}=await import("@playwright/test");
if(new URL(process.env.DATABASE_URL||"").pathname!=="/ai_town_mvp_test")throw Error("仅测试库");
const {database,readWorld}=await import("../src/lib/store.ts");
const {createWorld,populateResidents,restoreWorld,assertWorld}=await import("../src/lib/world.ts");
const dir=process.env.EVIDENCE_DIR||"evidence/v10-life/motion",id=`v10-motion-${randomUUID()}`,base="http://127.0.0.1:3118";
await mkdir(dir,{recursive:true});const log=createWriteStream(`${dir}/server.log`);let server,browser,context;const results=[],errors=[];
const delay=ms=>new Promise(r=>setTimeout(r,ms));
async function start(){server=spawn(process.execPath,["node_modules/next/dist/bin/next","start","--hostname","127.0.0.1","--port","3118"],{windowsHide:true,stdio:["ignore","pipe","pipe"],env:{...process.env,WORLD_ID:id,PUBLIC_DEMO:"false",AI_ENABLED:"false",NPC_AI_ENABLED:"false",AI_API_KEY:"",AI_BASE_URL:"",AI_MODEL:""}});server.stdout.pipe(log,{end:false});server.stderr.pipe(log,{end:false});for(let i=0;i<100;i++){try{if((await fetch(base+"/api/world")).ok)return;}catch{}await delay(100);}throw Error("start timeout");}
async function stop(){const child=server;server=null;if(child&&child.exitCode===null&&!child.signalCode)await new Promise(r=>{child.once("exit",r);child.kill();});}
async function get(){return (await fetch(base+"/api/world")).json();}
async function post(route,body){const r=await fetch(base+route,{method:"POST",headers:{"content-type":"application/json",origin:base},body:JSON.stringify(body)});assert.ok(r.ok,await r.clone().text());return r.json();}
try{
  const seed=populateResidents(createWorld());for(const n of seed.npcs)Object.assign(n,{hunger:0,energy:85,mood:60});seed.run={running:false,nextTickAt:null};
  await database().query("INSERT INTO town_worlds(id,revision,payload) VALUES($1,$2,$3)",[id,seed.revision,JSON.stringify(seed)]);
  await start();browser=await chromium.launch({headless:true});context=await browser.newContext({viewport:{width:1440,height:900},recordVideo:{dir,size:{width:1440,height:900}}});
  const a=await context.newPage(),b=await context.newPage();a.on("pageerror",e=>errors.push(e.message));await a.goto(base);await b.goto(base);await expect(a.getByTestId("scene-canvas")).toHaveAttribute("data-ready","true");await a.getByRole("button",{name:"全景",exact:true}).click();
  await a.getByRole("button",{name:"开始自动运行",exact:true}).click();await delay(3500);
  let w=await get();const n=w.npcs.find(n=>n.id==="muxi");assert.ok(n.ongoing?.path.length);assert.equal(n.location,"square");assert.ok(n.ongoing.durationMs>10000);await a.screenshot({path:`${dir}/01-long-walk.png`,fullPage:true});
  // One request wave from two observers cannot commit two quanta.
  const waves=await Promise.all(Array.from({length:8},()=>post("/api/world/wake",{})));assert.ok(Math.max(...waves.map(w=>w.revision))-Math.min(...waves.map(w=>w.revision))<=1);
  await post("/api/world/run",{running:false,expectedRevision:w.revision});await delay(1400);w=await get();const paused=structuredClone(w);await delay(2200);assert.deepEqual(await get(),paused);
  await a.screenshot({path:`${dir}/02-paused.png`,fullPage:true});await a.reload();await expect(a.getByTestId("scene-canvas")).toHaveAttribute("data-ready","true");assert.deepEqual(await get(),paused);
  await stop();await start();assert.deepEqual(await get(),paused);assert.deepEqual(restoreWorld(await readWorld(id)),paused);results.push("partial route pause/refresh/backend restart exact snapshot; duplicate wake serialized");
  await a.reload();await a.getByRole("button",{name:"全景",exact:true}).click();
  const cdp=await context.newCDPSession(a);await cdp.send("Emulation.setCPUThrottlingRate",{rate:6});
  await post("/api/world/run",{running:true,expectedRevision:paused.revision});
  const samples=[];for(let i=0;i<65;i++){
    await delay(1000);const current=await get(),npc=current.npcs.find(n=>n.id==="muxi");assertWorld(current);samples.push({minute:current.minute,scene:npc.sceneId,position:npc.position,elapsedMs:npc.ongoing?.elapsedMs,actionId:npc.ongoing?.id});
    if(i===5)await a.screenshot({path:`${dir}/03-slow-cpu-walk.png`,fullPage:true});
    if(npc.sceneId==="reed_interior"){await a.screenshot({path:`${dir}/04-entered.png`,fullPage:true});break;}
  }
  assert.equal(samples.at(-1).scene,"reed_interior");await cdp.send("Emulation.setCPUThrottlingRate",{rate:1});
  const now=await get();const final=await post("/api/world/run",{running:false,expectedRevision:now.revision});
  results.push("real long route enters through reed portal under 6x CPU throttling; fixed 1x simulation, no speed selector");
  assert.equal(errors.length,0);await writeFile(`${dir}/result.json`,JSON.stringify({id,results,samples,errors,paidCalls:0,finalRevision:final.revision},null,2));
  const video=a.video();await context.close();context=null;await rename(await video.path(),`${dir}/long-walk.webm`);console.log("V10 continuous browser passed",results);
}finally{await context?.close();await browser?.close();await stop();await database().end();log.end();}
