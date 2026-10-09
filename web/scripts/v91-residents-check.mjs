import assert from "node:assert/strict";
import {spawn} from "node:child_process";
import {randomUUID} from "node:crypto";
import {mkdir,writeFile,rename} from "node:fs/promises";
import {createWriteStream} from "node:fs";
import path from "node:path";
process.env.PLAYWRIGHT_BROWSERS_PATH=path.resolve(".browsers");
const {chromium,expect}=await import("@playwright/test");
if(new URL(process.env.DATABASE_URL||"").pathname!=="/ai_town_mvp_test")throw new Error("仅允许隔离测试库");
const dir=process.env.EVIDENCE_DIR||"evidence/v8-v9/v91",base="http://127.0.0.1:3115",worldId=`v91-browser-${randomUUID()}`;
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


const {database,migrateResidents,readWorld}=await import("../src/lib/store.ts");
const {createWorld,advanceWorld,assertWorld}=await import("../src/lib/world.ts");
const snapshots=[];
try{
  const legacyId=worldId+"-legacy",legacy=advanceWorld(createWorld());
  await database().query("INSERT INTO town_worlds(id,revision,payload) VALUES($1,$2,$3)",[legacyId,legacy.revision,JSON.stringify(legacy)]);
  await database().query("INSERT INTO town_private_chats(world_id,npc_id,visitor_id,turns) VALUES($1,'aqing',$2,$3)",[legacyId,"a".repeat(64),JSON.stringify([{message:"保留的私聊",reply:"不复制到公共日志"}])]);
  const migrated=await migrateResidents(legacyId);assert.equal(migrated.npcs.length,6);assert.deepEqual(migrated.npcs.slice(0,2),legacy.npcs);assert.deepEqual(migrated.events,legacy.events);assert.equal(migrated.minute,legacy.minute);assert.deepEqual(await migrateResidents(legacyId),migrated);assert.deepEqual(await readWorld(legacyId),migrated);
  assert.equal((await database().query("SELECT turns FROM town_private_chats WHERE world_id=$1",[legacyId])).rows[0].turns[0].message,"保留的私聊");checks.push("real PostgreSQL idempotent roster migration preserves old residents, minute, events and private chat");
  await start();browser=await chromium.launch({headless:true});context=await browser.newContext({viewport:{width:1440,height:900},recordVideo:{dir:`${dir}/video`,size:{width:1440,height:900}}});a=await context.newPage();video=a.video();a.on("pageerror",e=>errors.push(e.message));
  await a.goto(base);await expect(a.getByTestId("scene-canvas")).toHaveAttribute("data-ready","true");assert.equal((await world()).npcs.length,6);await shot("01-six-residents");
  await a.getByTestId("npc-xiaoyu").click();await a.getByRole("button",{name:"居民档案",exact:true}).click();await expect(a.getByTestId("profile")).toContainText("咖啡馆备餐员");await shot("02-new-resident-profile");await a.getByRole("button",{name:"关闭档案"}).click();
  await a.getByRole("textbox").fill("你现在在哪里？");await a.getByRole("textbox").press("Enter");await expect(a.getByTestId("reply-source")).toContainText("降级回复");await shot("03-new-resident-chat");await a.getByRole("button",{name:"关闭对话"}).click();
  for(let i=0;i<50;i++){const before=await world();const r=await fetch(base+"/api/world/tick",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({expectedRevision:before.revision})});assert.equal(r.status,200);const w=await r.json();assertWorld(w);snapshots.push(w);
    if(i===0){await expect(a.getByTestId("revision")).toContainText(String(w.revision));await delay(900);await shot("04-six-resident-paths");}
  }
  const saved=await world();await stop();await start();assert.deepEqual(await world(),saved);await a.reload();await expect(a.getByTestId("scene-canvas")).toHaveAttribute("data-ready","true");
  // Real keyboard trip to cafe; scene filtering uses the current backend roster.
  await walkTo({x:762,y:324});await enter(a,"cafe_interior");await shot("05-cafe-residents");await enter(a,"town");
  assert.deepEqual(errors,[]);checks.push("six real residents rendered; new identity/profile/Fallback; 50 persisted HTTP ticks with legal routes; backend restart exact snapshot; cafe scene filter");
  await context.close();context=null;await rename(await video.path(),`${dir}/six-residents.webm`);await writeFile(`${dir}/result.json`,JSON.stringify({date:new Date().toISOString(),worldId,checks,snapshots,screenshots,errors,buildings:TOWN_BUILDINGS.length,externalModelCalls:0},null,2));console.log("V9.1 migration/browser passed");
}catch(e){if(a&&!a.isClosed())await shot("failure");throw e;}finally{await context?.close();await browser?.close();await stop();await database().end();log.end();}
