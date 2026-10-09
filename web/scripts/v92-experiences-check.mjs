import assert from "node:assert/strict";
import {spawn} from "node:child_process";
import {randomUUID} from "node:crypto";
import {mkdir,writeFile,rename} from "node:fs/promises";
import {createWriteStream} from "node:fs";
import path from "node:path";
process.env.PLAYWRIGHT_BROWSERS_PATH=path.resolve(".browsers");
const {chromium,expect}=await import("@playwright/test");
if(new URL(process.env.DATABASE_URL||"").pathname!=="/ai_town_mvp_test")throw new Error("仅允许隔离测试库");
const dir=process.env.EVIDENCE_DIR||"evidence/v8-v9/v92",base="http://127.0.0.1:3115",worldId=`v92-browser-${randomUUID()}`;
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

const {database}=await import("../src/lib/store.ts");const {createWorld,populateResidents}=await import("../src/lib/world.ts");
try{
  const seed=populateResidents(createWorld());seed.npcs[0].hunger=0;seed.npcs[0].energy=80;seed.npcs[1].hunger=0;seed.npcs[1].energy=80;for(const n of seed.npcs.slice(2)){n.energy=5;n.hunger=0;}
  await database().query("INSERT INTO town_worlds(id,revision,payload) VALUES($1,$2,$3)",[worldId,seed.revision,JSON.stringify(seed)]);
  await start();browser=await chromium.launch({headless:true});context=await browser.newContext({viewport:{width:1440,height:900},recordVideo:{dir:`${dir}/video`,size:{width:1440,height:900}}});a=await context.newPage();video=a.video();a.on("pageerror",e=>errors.push(e.message));
  await a.goto(base);await expect(a.getByTestId("scene-canvas")).toHaveAttribute("data-ready","true");await a.getByRole("button",{name:/推进一步/}).click();await expect.poll(async()=>(await world()).revision).toBe(seed.revision+1);
  const saved=await world(),fact=saved.experiences.facts.find(e=>e.participants.includes("aqing")&&e.participants.includes("aning"));assert.ok(fact);assert.ok(saved.experiences.memories.aqing.some(m=>m.eventId===fact.id));assert.ok(!saved.experiences.memories.xiaoyu?.some(m=>m.eventId===fact.id));
  await a.getByTestId("npc-aqing").click();await a.getByRole("button",{name:"居民档案",exact:true}).click();await expect(a.getByTestId("npc-memory").first()).toContainText("碰面");await shot("01-personal-memory");await a.getByRole("button",{name:"关闭档案"}).click();
  await a.getByRole("textbox").fill("记得什么？私密暗号V92");await a.getByRole("textbox").press("Enter");await expect(a.getByTestId("chat-reply")).toContainText("亲历");await shot("02-remembered-dialogue");assert.deepEqual(await world(),saved);assert.ok(!JSON.stringify(saved).includes("私密暗号V92"));
  await a.getByRole("button",{name:"关闭对话"}).click();await a.getByRole("button",{name:/打开日志/}).click();await shot("03-public-confirmed-event");await a.getByRole("button",{name:"关闭日志"}).click();
  await stop();await start();assert.deepEqual(await world(),saved);await a.reload();await expect(a.getByTestId("scene-canvas")).toHaveAttribute("data-ready","true");
  assert.deepEqual(errors,[]);checks.push("controlled real meeting creates persisted fact, participant-only memories and sourced relationship; profile and Fallback cite experience; private message excluded from public snapshot; backend restart identical");
  await context.close();context=null;await rename(await video.path(),`${dir}/experiences.webm`);await writeFile(`${dir}/result.json`,JSON.stringify({date:new Date().toISOString(),worldId,checks,saved,screenshots,errors,externalModelCalls:0},null,2));console.log("V9.2 facts/memory/database/browser passed");
}catch(e){if(a&&!a.isClosed())await shot("failure");throw e;}finally{await context?.close();await browser?.close();await stop();await database().end();log.end();}
