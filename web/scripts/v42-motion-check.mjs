import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdir,writeFile,rename } from "node:fs/promises";
import { createWriteStream } from "node:fs";
import path from "node:path";
process.env.PLAYWRIGHT_BROWSERS_PATH=path.resolve(".browsers");
const {chromium,expect}=await import("@playwright/test");
if(new URL(process.env.DATABASE_URL||"").pathname!=="/ai_town_mvp_test")throw new Error("仅允许隔离测试库");
const dir=process.env.EVIDENCE_DIR||"evidence/v4-2/scene",base="http://127.0.0.1:3106",worldId=`v42-${randomUUID()}`;
await mkdir(dir,{recursive:true});const log=createWriteStream(`${dir}/server.log`,{flags:"a"});
const server=spawn(process.execPath,["node_modules/next/dist/bin/next","start","--hostname","127.0.0.1","--port","3106"],{windowsHide:true,stdio:["ignore","pipe","pipe"],env:{...process.env,WORLD_ID:worldId,AI_ENABLED:"false",AI_API_KEY:"",AI_BASE_URL:"",AI_MODEL:"",NEXT_TELEMETRY_DISABLED:"1"}});
server.stdout.pipe(log,{end:false});server.stderr.pipe(log,{end:false});
let browser,context,page,video;const checks=[],trace=[],errors=[],screenshots=[];
const delay=ms=>new Promise(r=>setTimeout(r,ms));
const world=async()=>await (await fetch(base+"/api/world")).json();
const shot=async name=>{await page.screenshot({path:`${dir}/${name}.png`,fullPage:true});screenshots.push(name);};
const pose=async()=>page.getByTestId("npc-aqing").evaluate(el=>({x:parseFloat(el.style.left),y:parseFloat(el.style.top),motion:el.dataset.motion,facing:el.dataset.facing,frame:Number(el.dataset.frame)}));
async function tick(){const minute=(await world()).minute;await page.getByRole("button",{name:"推进一步"}).click();await expect.poll(async()=>(await world()).minute).toBe(minute+10);}
async function alignment(){
  const result=await page.evaluate(()=>{
    const bubble=document.querySelector('[data-testid="speech-bubble"]'),npc=document.querySelector('[data-testid="npc-aqing"]'),view=document.querySelector('[data-testid="scene-viewport"]');
    const b=bubble.getBoundingClientRect(),n=npc.getBoundingClientRect(),v=view.getBoundingClientRect();
    return {dx:b.x+parseFloat(bubble.style.getPropertyValue("--tail-x"))-n.x-n.width/2,bottom:b.bottom,top:n.top,clipped:b.x<v.x-1||b.right>v.right+1};
  });
  assert.ok(Math.abs(result.dx)<2);assert.ok(result.bottom<=result.top+2);assert.equal(result.clipped,false);
}
try{
  for(let i=0;i<100;i++){try{const r=await fetch(base+"/api/world");if(r.status===404)break;}catch{}await delay(100);}
  browser=await chromium.launch({headless:true});context=await browser.newContext({viewport:{width:1440,height:900},recordVideo:{dir:`${dir}/video`,size:{width:1440,height:900}}});page=await context.newPage();video=page.video();page.on("pageerror",e=>errors.push(e.message));
  await page.goto(base);await expect(page.getByTestId("scene-canvas")).toHaveAttribute("data-ready","true");await shot("01-neighborhood");
  assert.deepEqual(await page.locator("canvas").evaluate(c=>({width:c.width,height:c.height})),{width:480,height:300});
  await page.getByTestId("npc-aqing").click();await expect(page.getByRole("textbox")).toBeEnabled();await shot("02-residents");
  await page.getByRole("button",{name:"居民档案",exact:true}).click();await shot("03-profile");await page.getByRole("button",{name:"关闭档案"}).click();
  await page.getByRole("textbox").fill("你现在在干什么？");await page.getByRole("textbox").press("Enter");await expect(page.getByTestId("reply-source")).toContainText("降级回复");await shot("04-speech");
  await page.getByRole("textbox").fill("走路时保留的草稿");
  await page.getByRole("button",{name:"开始自动运行"}).click();await expect(page.getByTestId("npc-aqing")).toHaveAttribute("data-motion","walking",{timeout:8500});
  const committed=await world();assert.deepEqual(committed.npcs[0].position,{x:754,y:324});
  trace.push(await pose());assert.ok(trace[0].x<754);await alignment();await shot("05-walk-start");
  await expect.poll(async()=>(await pose()).x).toBeGreaterThan(540);trace.push(await pose());await shot("06-walk-middle");
  // Pause changes the clock, not the already committed journey.
  await page.getByRole("button",{name:"暂停自动运行"}).click();await expect(page.getByTestId("run-status")).toContainText("已暂停");
  await page.getByRole("button",{name:"放大地图"}).click();
  const view=await page.getByTestId("scene-viewport").boundingBox();await page.mouse.move(view.x+view.width*.35,view.y+view.height*.84);await page.mouse.down();await page.mouse.move(view.x+view.width*.35+30,view.y+view.height*.84+20,{steps:3});await page.mouse.up();
  for(let i=0;i<35;i++){trace.push(await pose());await alignment();if(trace.at(-1).motion==="idle")break;await delay(60);}
  await expect(page.getByTestId("npc-aqing")).toHaveAttribute("data-motion","idle");
  assert.deepEqual(await pose(),{x:754,y:324,motion:"idle",facing:"north",frame:0});await shot("07-walk-end-camera");
  await expect(page.getByRole("textbox")).toHaveValue("走路时保留的草稿");
  for(const p of trace)assert.ok((p.x===442&&p.y>=358&&p.y<=368)||(p.y===358&&p.x>=442&&p.x<=754)||(p.x===754&&p.y>=324&&p.y<=358),"visual foot remains on committed path");
  assert.ok(trace.some(p=>p.frame!==0));assert.ok(trace.some(p=>p.facing==="east"));assert.ok(trace.some(p=>p.facing==="north"));
  checks.push("自动推进触发真实路径；开始/中途/结束、帧切换与转向；阴影/点击区域/气泡共用表现位置，缩放平移无偏离");
  const paused=await world();await delay(5400);assert.deepEqual(await world(),paused);const paints=await page.getByTestId("scene-canvas").getAttribute("data-paints");await delay(1200);assert.equal(await page.getByTestId("scene-canvas").getAttribute("data-paints"),paints);
  checks.push("暂停后已提交行走正常收尾；未来世界不推进，待机不持续重绘");
  await page.getByRole("button",{name:"复位",exact:true}).click();
  await tick();await expect.poll(async()=>(await world()).minute).toBe(500);
  await expect(page.getByTestId("npc-aqing")).toHaveCount(0); // V7.1: enter on a separate logical step
  await tick(); // eat indoors
  await tick(); // needs now choose exit
  await expect(page.getByTestId("npc-aqing")).toHaveAttribute("data-motion","idle");
  await tick();await expect(page.getByTestId("npc-aqing")).toHaveAttribute("data-motion","walking");
  // Several manual commits overtake the first animation: first socialize, then move home.
  for(let i=0;i<12&&(await world()).npcs[0].location!=="home";i++)await tick();
  await expect.poll(async()=>(await world()).npcs[0].location).toBe("home");
  const interrupted=await pose();assert.equal(interrupted.motion,"walking");assert.ok(interrupted.x>210);
  await expect(page.getByTestId("npc-aqing")).toHaveAttribute("data-motion","idle",{timeout:4000});assert.equal((await pose()).x,210);
  checks.push("未播完时收到连续手动提交：状态更新不重播；新移动沿剩余已提交路段接续，最终到达最新住宅坐标");
  await tick(); // rest
  await tick(); // go to cafe
  await expect(page.getByTestId("npc-aqing")).toHaveAttribute("data-motion","walking");
  const beforeRefresh=await world();
  await page.reload();await expect(page.getByTestId("scene-canvas")).toHaveAttribute("data-ready","true");assert.deepEqual((await pose()).x,beforeRefresh.npcs[0].position.x);assert.equal((await pose()).motion,"idle");
  checks.push("手动推进复用同一路径播放器；移动中刷新直接恢复保存终点，不重放旧lastPath");
  await expect(page.getByRole("textbox")).toBeEnabled();const beforeFood=await world();await page.getByRole("button",{name:/送食物/}).click();await expect(page.getByTestId("food-feedback")).toContainText("已保存");const fed=await world();assert.equal(fed.npcs[0].hunger,Math.max(0,beforeFood.npcs[0].hunger-35));assert.equal((await pose()).motion,"idle");
  await page.getByRole("textbox").fill("你现在在干什么？");await page.getByRole("textbox").press("Enter");await expect(page.getByTestId("chat-reply")).toContainText(fed.locations.find(l=>l.id===fed.npcs[0].location).name);await alignment();
  await page.getByRole("button",{name:"查看历史",exact:true}).click();await expect(page.getByTestId("chat-turn")).toHaveCount(2);await page.getByRole("button",{name:"关闭历史"}).click();
  checks.push("干预保存真实饥饿变化且不重播动画；聊天Fallback仍按真实地点回答，历史保持");
  await page.setViewportSize({width:1366,height:768});await delay(200);await alignment();await shot("08-speech-1366");
  await page.getByRole("button",{name:"居民档案",exact:true}).click();await shot("09-profile-1366");await page.getByRole("button",{name:"关闭档案"}).click();
  const button=await page.getByRole("button",{name:"发送消息",exact:true}).boundingBox();assert.ok(button.y+button.height<=768);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await page.goto(base);await expect(page.getByTestId("scene-canvas")).toHaveAttribute("data-ready","true");await shot("10-neighborhood-1366");
  checks.push("1440×900与1366×768场景、气泡、档案、输入区可用");assert.deepEqual(errors,[]);
  await context.close();context=null;await rename(await video.path(),`${dir}/automatic-walking.webm`);
  await writeFile(`${dir}/result.json`,JSON.stringify({worldId,checks,trace,screenshots,pageErrors:errors,realModelCalls:0,video:"automatic-walking.webm",date:new Date().toISOString()},null,2));console.log(`${checks.length} motion/browser groups passed; 10 screenshots and actual WebM recording.`);
}catch(e){if(page&&!page.isClosed())await shot("failure");throw e;}
finally{await context?.close();await browser?.close();if(server.exitCode===null)await new Promise(r=>{server.once("exit",r);server.kill();});log.end();}
