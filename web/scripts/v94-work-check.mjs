import assert from "node:assert/strict";
import {spawn} from "node:child_process";
import {randomUUID} from "node:crypto";
import {mkdir,writeFile,rename} from "node:fs/promises";
import {createWriteStream} from "node:fs";
import path from "node:path";
process.env.PLAYWRIGHT_BROWSERS_PATH=path.resolve(".browsers");
const {chromium,expect}=await import("@playwright/test");
if(new URL(process.env.DATABASE_URL||"").pathname!=="/ai_town_mvp_test")throw new Error("仅允许隔离测试库");
const dir=process.env.EVIDENCE_DIR||"evidence/v8-v9/v94",base="http://127.0.0.1:3115",worldId=`v94-browser-${randomUUID()}`;
await mkdir(dir,{recursive:true});const log=createWriteStream(`${dir}/server.log`,{flags:"a"});
let server,browser,a,context,video;const checks=[],errors=[],screenshots=[];
const delay=ms=>new Promise(r=>setTimeout(r,ms));
const world=async()=>await(await fetch(base+"/api/world")).json();
async function start(){
  server=spawn(process.execPath,["node_modules/next/dist/bin/next","start","--hostname","127.0.0.1","--port","3115"],{windowsHide:true,stdio:["ignore","pipe","pipe"],env:{...process.env,WORLD_ID:worldId,PUBLIC_DEMO:"false",AI_ENABLED:"false",NPC_AI_ENABLED:"false",AI_API_KEY:"",AI_BASE_URL:"",AI_MODEL:""}});
  server.stdout.pipe(log,{end:false});server.stderr.pipe(log,{end:false});
  for(let i=0;i<100;i++){if(server.exitCode!==null)throw new Error("server exited");try{const r=await fetch(base+"/api/world");if(r.ok||r.status===404)return;}catch{}await delay(100);}throw new Error("server timeout");
}
async function stop(){const child=server;server=null;if(child&&child.exitCode===null&&!child.signalCode)await new Promise(r=>{child.once("exit",r);child.kill();});}
async function shot(name,page=a){await page.screenshot({path:`${dir}/${name}.png`,fullPage:true});screenshots.push(name);}
async function move(page,axis,target){
  await page.getByTestId("scene-viewport").focus();const value=Number(await page.getByTestId("player").getAttribute(`data-${axis}`)),positive=target>value;
  if(Math.abs(target-value)<=3)return;
  const key=axis==="x"?(positive?"d":"a"):(positive?"s":"w");await page.keyboard.down(key);
  try{await page.waitForFunction(({axis,target,positive})=>{const value=Number(document.querySelector('[data-testid="player"]').dataset[axis]);return positive?value>=target-2:value<=target+2;},{axis,target,positive},{timeout:30000});}catch(error){console.error({axis,target,value,actual:await page.getByTestId("player").getAttribute(`data-${axis}`)});throw error;}finally{await page.keyboard.up(key);}
}
async function enter(page,scene){await page.getByTestId("scene-viewport").focus();await page.keyboard.press("e");await expect(page.getByTestId("scene-canvas")).toHaveAttribute("data-scene",scene);}

const {findScenePath}=await import("../src/lib/navigation.ts");
async function walkTo(end){
  const start={x:Number(await a.getByTestId("player").getAttribute("data-x")),y:Number(await a.getByTestId("player").getAttribute("data-y"))};
  const path=findScenePath("town",start,end);assert.ok(path.length>1,`route exists ${JSON.stringify({start,end})}`);
  for(const p of path.slice(1)){await move(a,"x",p.x);await move(a,"y",p.y);}
}


const {database}=await import("../src/lib/store.ts");
const {createWorld,populateResidents,advanceWorld,assertWorld,restoreWorld}=await import("../src/lib/world.ts");
const {prepareWork,workPoint}=await import("../src/lib/work.ts");
const snapshots=[],metrics={};
async function tick(){const before=await world(),r=await fetch(base+"/api/world/tick",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({expectedRevision:before.revision})});assert.equal(r.status,200);const w=await r.json();assertWorld(w);snapshots.push(w);return w;}
try{
  const seed=populateResidents(createWorld());prepareWork(seed);
  for(const n of seed.npcs.slice(2,4))Object.assign(n,{sceneId:`${n.job}_interior`,location:n.job,position:workPoint(n),hunger:0,energy:90,lastPath:[]});
  seed.npcs[2].workTask.progress=1;
  Object.assign(seed.npcs[5],{sceneId:"cafe_interior",location:"cafe",position:{x:520,y:320},hunger:0,energy:90,lastPath:[]});
  await database().query("INSERT INTO town_worlds(id,revision,payload) VALUES($1,$2,$3)",[worldId,seed.revision,JSON.stringify(seed)]);
  await start();browser=await chromium.launch({headless:true});context=await browser.newContext({viewport:{width:1440,height:900},recordVideo:{dir:`${dir}/video`,size:{width:1440,height:900}}});a=await context.newPage();video=a.video();a.on("pageerror",e=>errors.push(e.message));
  await a.goto(base);await expect(a.getByTestId("scene-canvas")).toHaveAttribute("data-ready","true");await walkTo({x:762,y:324});await enter(a,"cafe_interior");await shot("01-workplace-before");
  await a.getByRole("button",{name:/推进一步/}).click();await expect.poll(async()=>(await world()).workOutputs?.cafe).toBe(1);const done=await world();assertWorld(done);
  const fact=done.experiences.facts.find(f=>f.kind==="work"&&f.participants.includes("xiaoman"));assert.ok(fact);snapshots.push(done);
  await a.getByTestId("npc-xiaoyu").click();await a.getByRole("button",{name:"居民档案",exact:true}).click();await expect(a.getByTestId("work-task")).toContainText("2/2");await shot("02-cafe-completed");await a.getByRole("button",{name:"关闭档案"}).click();
  await a.getByRole("textbox").fill("记得什么合作经历？");await a.getByRole("textbox").press("Enter");await expect(a.getByTestId("chat-reply")).toContainText("协助核对");await expect(a.getByTestId("reply-source")).toContainText("降级");await shot("03-work-memory-dialogue");await a.getByRole("button",{name:"关闭对话"}).click();
  const second=await tick();assert.equal(second.workOutputs.store,1);await enter(a,"town");await walkTo({x:1158,y:324});await enter(a,"store_interior");await a.getByTestId("npc-laolin").click();await a.getByRole("button",{name:"居民档案",exact:true}).click();await expect(a.getByTestId("work-task")).toContainText("货架 1");await shot("04-store-completed");await a.getByRole("button",{name:"关闭档案"}).click();await a.getByRole("button",{name:"关闭对话"}).click();
  await a.setViewportSize({width:1366,height:768});await shot("05-store-1366");assert.ok(await a.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  // Two independent observers wake one shared persisted clock; no extra simulation.
  const b=await context.newPage();await b.goto(base);await expect(b.getByTestId("scene-canvas")).toHaveAttribute("data-ready","true");const startMinute=(await world()).minute;
  await a.getByRole("button",{name:/开始自动运行/}).click();await expect.poll(async()=>(await world()).minute,{timeout:9000}).toBe(startMinute+10);const pauseResponse=a.waitForResponse(r=>r.url().endsWith("/api/world/run")&&r.request().method()==="POST");await a.getByRole("button",{name:"暂停自动运行",exact:true}).click();assert.equal((await pauseResponse).status(),200);const paused=await world();await delay(5500);assert.deepEqual(await world(),paused);await shot("06-paused-saved-work");await b.close();
  const saved=await world();await a.reload();await expect(a.getByTestId("scene-canvas")).toHaveAttribute("data-ready","true");assert.deepEqual(await world(),saved);await stop();await start();assert.deepEqual(await world(),saved);
  // Long deterministic simulation and a separate 25-resident content stress sample. No model calls.
  let long=populateResidents(createWorld());const began=performance.now();for(let i=0;i<1440;i++){long=advanceWorld(long);assertWorld(long);}metrics.long={steps:1440,elapsedMs:performance.now()-began,outputs:long.workOutputs,bytes:JSON.stringify(long).length};
  let stress=populateResidents(createWorld());while(stress.npcs.length<25){const n=structuredClone(stress.npcs[2+stress.npcs.length%4]);n.id=`load${stress.npcs.length}`;n.name=`测试居民${stress.npcs.length}`;delete n.workTask;stress.npcs.push(n);}const timings=[];let mockCalls=0,lastSocial;const {socialReplies}=await import("../src/lib/social-service.ts");const config={enabled:true,key:"mock-only",baseUrl:"http://127.0.0.1:9999/v1",model:"mock",timeoutMs:100,testMode:true};const transport=async()=>{mockCalls++;return new Response(JSON.stringify({choices:[{message:{content:"我们按已知经历交流，完成工作后再休息。"}}]}));};
  for(let i=0;i<300;i++){const t=performance.now();stress=advanceWorld(stress);const c=stress.conversations?.at(-1);if(c&&c.id!==lastSocial){c.turns=await socialReplies(c,stress,config,transport);c.modelState="done";lastSocial=c.id;}assertWorld(stress);timings.push(performance.now()-t);}timings.sort((a,b)=>a-b);metrics.stress={mockCalls,residents:25,steps:300,meanMs:timings.reduce((x,y)=>x+y)/timings.length,p95Ms:timings[284],snapshotBytes:JSON.stringify(stress).length,outputs:stress.workOutputs};
  assert.deepEqual(restoreWorld(JSON.parse(JSON.stringify(stress))),stress);
  const stressId=worldId+"-stress";await database().query("INSERT INTO town_worlds(id,revision,payload) VALUES($1,$2,$3)",[stressId,stress.revision,JSON.stringify(stress)]);
  await writeFile(`${dir}/postgres-before.json`,JSON.stringify({worldId,stressId,saved,stress},null,2));
  assert.deepEqual(errors,[]);checks.push("real cafe and store output, cooperation fact-memory-relation-private Fallback, two tab clock/pause, browser refresh and backend restart exact", "1440-step 6-resident and 300-step 25-resident legal simulation; PostgreSQL snapshots retained for restart verification");
  await context.close();context=null;await rename(await video.path(),`${dir}/work-cooperation.webm`);await writeFile(`${dir}/result.json`,JSON.stringify({date:new Date().toISOString(),worldId,checks,metrics,snapshots,screenshots,errors,externalModelCalls:0},null,2));console.log("V9.4 work/browser/simulation passed",metrics);
}catch(e){if(a&&!a.isClosed())await shot("failure");throw e;}finally{await context?.close();await browser?.close();await stop();await database().end();log.end();}
