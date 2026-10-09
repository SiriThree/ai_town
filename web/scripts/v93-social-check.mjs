import assert from "node:assert/strict";
import {spawn} from "node:child_process";
import {randomUUID} from "node:crypto";
import {mkdir,writeFile} from "node:fs/promises";
import {createWriteStream} from "node:fs";
import path from "node:path";
process.env.PLAYWRIGHT_BROWSERS_PATH=path.resolve(".browsers");
const {chromium,expect}=await import("@playwright/test");
if(new URL(process.env.DATABASE_URL||"").pathname!=="/ai_town_mvp_test")throw new Error("仅允许隔离测试库");
const dir=process.env.EVIDENCE_DIR||"evidence/v8-v9/v93",base="http://127.0.0.1:3115",worldId=`v93-browser-${randomUUID()}`;
await mkdir(dir,{recursive:true});const log=createWriteStream(`${dir}/server.log`,{flags:"a"});
let activeWorld=worldId;let server,browser,a,context;const checks=[],errors=[],screenshots=[];
const delay=ms=>new Promise(r=>setTimeout(r,ms));
const world=async()=>await(await fetch(base+"/api/world")).json();
async function start(){
  server=spawn(process.execPath,["node_modules/next/dist/bin/next","start","--hostname","127.0.0.1","--port","3115"],{windowsHide:true,stdio:["ignore","pipe","pipe"],env:{...process.env,WORLD_ID:activeWorld,PUBLIC_DEMO:"false",AI_ENABLED:"true",NPC_AI_ENABLED:"true",AI_API_KEY:"mock-only",AI_BASE_URL:"http://127.0.0.1:3193/v1",AI_MODEL:"mock",AI_TEST_MODE:"true",AI_TIMEOUT_MS:"160",AI_CALLS_PER_DAY:"8"}});
  server.stdout.pipe(log,{end:false});server.stderr.pipe(log,{end:false});
  for(let i=0;i<100;i++){if(server.exitCode!==null)throw new Error("server exited");try{const r=await fetch(base+"/api/world");if(r.ok||r.status===404)return;}catch{}await delay(100);}throw new Error("server timeout");
}
async function stop(){const child=server;server=null;if(child&&child.exitCode===null&&!child.signalCode)await new Promise(r=>{child.once("exit",r);child.kill();});}
async function shot(name,page=a){await page.screenshot({path:`${dir}/${name}.png`,fullPage:true});screenshots.push(name);}


const {database}=await import("../src/lib/store.ts");const {createWorld,populateResidents}=await import("../src/lib/world.ts");const {createServer}=await import("node:http");
let mode="normal",calls=0;const requestCounts={},results=[];
const model=createServer(async(req,res)=>{let raw="";for await(const chunk of req)raw+=chunk;calls++;if(mode==="timeout"){setTimeout(()=>res.end("{}"),900).unref();return;}if(mode==="error"){res.writeHead(503);res.end("failure");return;}
  const input=JSON.parse(raw),facts=JSON.parse(input.messages[0].content.split("世界事实：\n")[1]);res.setHeader("Content-Type","application/json");res.end(JSON.stringify({choices:[{message:{content:`我是${facts.name}，当前在${facts.location}，很高兴和邻居聊一会儿。`}}]}));});
await new Promise(r=>model.listen(3193,"127.0.0.1",r));
try{
 browser=await chromium.launch({headless:true});
 for(const scenario of ["normal","error","timeout"]){
  mode=scenario;activeWorld=worldId+"-"+scenario;const seed=populateResidents(createWorld());seed.npcs[0].hunger=0;seed.npcs[0].energy=80;seed.npcs[1].hunger=0;seed.npcs[1].energy=80;for(const n of seed.npcs.slice(2)){n.energy=5;n.hunger=0;}
  await database().query("INSERT INTO town_worlds(id,revision,payload) VALUES($1,$2,$3)",[activeWorld,seed.revision,JSON.stringify(seed)]);await start();context=await browser.newContext({viewport:{width:1440,height:900}});a=await context.newPage();a.on("pageerror",e=>errors.push(e.message));await a.goto(base);await expect(a.getByTestId("scene-canvas")).toHaveAttribute("data-ready","true");
  const beforeCalls=calls,began=performance.now();await a.getByRole("button",{name:/推进一步/}).click();
  await Promise.all(Array.from({length:6},()=>fetch(base+"/api/world/wake",{method:"POST",headers:{"Content-Type":"application/json"},body:"{}"})));
  await expect.poll(async()=>(await world()).conversations?.[0]?.modelState,{timeout:6000}).toBe("done");const w=await world(),c=w.conversations[0];requestCounts[scenario]=calls-beforeCalls;assert.equal(requestCounts[scenario],2);
  assert.ok(c.turns.every(t=>t.source===(scenario==="normal"?"ai":"fallback")));if(scenario==="timeout")assert.ok(c.turns.every(t=>t.reason==="timeout"));
  await expect(a.getByTestId("revision")).toHaveText(`存档版本 ${w.revision}`);
  if(scenario==="normal")await expect(a.getByTestId("public-bubble-aqing")).toContainText("AI·测试替身");
  await expect(a.getByTestId("public-bubble-aqing")).toBeVisible();await expect(a.getByTestId("public-bubble-aning")).toBeVisible();await shot("public-"+scenario);await a.getByTestId("public-bubble-aqing").getByRole("button").click();await expect(a.getByTestId("public-conversation")).toBeVisible();await shot("log-"+scenario);await a.getByRole("button",{name:"关闭日志"}).click();
  const tick=await fetch(base+"/api/world/tick",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({expectedRevision:w.revision})});assert.equal(tick.status,200);const next=await tick.json();assert.equal(next.minute,w.minute+10);assert.equal(next.conversations.length,1);
  const saved=await world();await context.close();context=null;await stop();await start();assert.deepEqual(await world(),saved);await stop();results.push({scenario,elapsedMs:performance.now()-began,conversation:c,savedRevision:saved.revision});
 }
 assert.deepEqual(errors,[]);checks.push("normal local model substitute, service error and timeout each bounded to two calls; real public bubbles and logs; cooldown prevents duplicate dialogue; subsequent world tick and backend restore succeed");
 await writeFile(`${dir}/result.json`,JSON.stringify({date:new Date().toISOString(),worldId,checks,requestCounts,results,screenshots,errors,externalPaidCalls:0},null,2));console.log("V9.3 model substitute/error/timeout browser passed",requestCounts);
}catch(e){if(a&&!a.isClosed())await shot("failure");throw e;}finally{await context?.close();await browser?.close();await stop();model.closeAllConnections();await new Promise(r=>model.close(r));await database().end();log.end();}
