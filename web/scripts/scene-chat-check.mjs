import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { createWriteStream } from "node:fs";
import path from "node:path";
process.env.PLAYWRIGHT_BROWSERS_PATH=path.resolve(".browsers");
const {chromium,expect}=await import("@playwright/test");
if(new URL(process.env.DATABASE_URL||"").pathname!=="/ai_town_mvp_test")throw new Error("仅允许隔离测试库");
const dir=process.env.EVIDENCE_DIR || "evidence/scene-chat",base="http://127.0.0.1:3103",worldId=`scene-${randomUUID()}`;
await mkdir(dir,{recursive:true});
const log=createWriteStream(`${dir}/scene-server.log`,{flags:"a"});
const server=spawn(process.execPath,["node_modules/next/dist/bin/next","start","--hostname","127.0.0.1","--port","3103"],{windowsHide:true,stdio:["ignore","pipe","pipe"],env:{...process.env,WORLD_ID:worldId,AI_ENABLED:"false",AI_API_KEY:"",AI_BASE_URL:"",AI_MODEL:"",AI_TEST_MODE:"false",NEXT_TELEMETRY_DISABLED:"1"}});
server.stdout.pipe(log,{end:false});server.stderr.pipe(log,{end:false});
let browser,page;
const checks=[],errors=[],positions=[];
async function world(){const r=await fetch(`${base}/api/world`);assert.equal(r.status,200);return r.json();}
async function hist(id){const r=await fetch(`${base}/api/npcs/${id}/chat`,{headers:{cookie:(await page.context().cookies(base)).map(c=>`${c.name}=${c.value}`).join("; ")}});return (await r.json()).turns;}
async function send(message){await page.getByRole("textbox").fill(message);await page.getByRole("textbox").press("Enter");await expect(page.getByRole("textbox")).toHaveValue("");}
async function aligned(id){
  await expect(page.getByTestId("speech-bubble")).toHaveAttribute("data-npc",id);
  const result=await page.evaluate(id=>{
    const bubble=document.querySelector('[data-testid="speech-bubble"]'),b=bubble.getBoundingClientRect();
    const target=document.querySelector(`[data-testid="npc-${id}"]`).getBoundingClientRect();
    const viewport=document.querySelector('[data-testid="scene-viewport"]').getBoundingClientRect();
    const tail=parseFloat(bubble.style.getPropertyValue("--tail-x"));
    return {bubble:{x:b.x,y:b.y,width:b.width,height:b.height},target:{x:target.x,y:target.y,width:target.width,height:target.height},viewport:{x:viewport.x,y:viewport.y,width:viewport.width,height:viewport.height},tail};
  },id);
  const {bubble:b,target:t,viewport:v,tail}=result;
  assert.ok(Math.abs(b.x+tail-(t.x+t.width/2))<2,"tail aligned with resident");
  assert.ok(b.y+b.height<=t.y+2,"bubble above character hitbox, not on body");
  assert.ok(b.x>=v.x && b.x+b.width<=v.x+v.width+1 && b.y>=v.y,"bubble within viewport");
  positions.push({id,...result});return result;
}
async function drag(dx,dy){const v=await page.getByTestId("scene-viewport").boundingBox();await page.mouse.move(v.x+v.width*.35,v.y+v.height*.87);await page.mouse.down();await page.mouse.move(v.x+v.width*.35+dx,v.y+v.height*.87+dy,{steps:8});await page.mouse.up();}
try{
  let ready=false;for(let i=0;i<100;i++){try{const r=await fetch(`${base}/api/world`);if(r.status===404){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,100));}assert.ok(ready);
  browser=await chromium.launch({headless:true});page=await browser.newPage({viewport:{width:1440,height:1180}});page.on("pageerror",e=>errors.push(e.message));
  await page.goto(base);await expect(page.getByTestId("scene-canvas")).toHaveAttribute("data-ready","true");
  await expect(page.getByTestId("scene-composer")).toHaveCount(0);
  await page.screenshot({path:`${dir}/01-default.png`,fullPage:true});
  const initial=await world();await page.getByTestId("npc-aqing").click();await expect(page.getByRole("textbox")).toBeEnabled();
  await expect(page.getByTestId("npc-aqing")).toHaveAttribute("aria-pressed","true");await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.screenshot({path:`${dir}/02-selected.png`,fullPage:true});
  const originalTransform=await page.getByTestId("world-plane").getAttribute("style");
  await page.getByRole("textbox").fill("你好");await page.getByRole("textbox").press("Shift+Enter");await expect(page.getByRole("textbox")).toHaveValue("你好\n");
  assert.equal((await hist("aqing")).length,0);assert.equal(await page.getByTestId("world-plane").getAttribute("style"),originalTransform);
  await send("你现在在干什么？");const first=(await hist("aqing"))[0];assert.equal(first.source,"fallback");assert.equal(first.reason,"not_configured");
  await expect(page.getByTestId("chat-reply")).toHaveText(first.reply);await aligned("aqing");assert.deepEqual(await world(),initial);
  await page.screenshot({path:`${dir}/03-reply.png`,fullPage:true});checks.push("选中直接输入，无模态遮罩；Enter发送/Shift+Enter换行，不推进世界，气泡为已保存的无密钥回复");
  await page.getByRole("button",{name:"放大地图"}).click();await drag(95,45);await aligned("aqing");
  await page.screenshot({path:`${dir}/04-camera.png`,fullPage:true});checks.push("125%缩放与拖动平移后，尾巴仍与阿晴脚点X及头顶映射一致");
  await page.getByRole("button",{name:"复位",exact:true}).click();await drag(-460,0);await aligned("aqing");
  await drag(-350,0);await expect(page.getByTestId("speech-bubble")).toHaveCount(0);
  await page.getByRole("button",{name:"复位",exact:true}).click();await expect(page.getByTestId("chat-reply")).toHaveText(first.reply);checks.push("左侧边缘气泡夹紧、NPC移出镜头隐藏气泡、复位恢复原发言");
  await page.getByTestId("npc-aning").click();await expect(page.getByRole("textbox")).toBeEnabled();await expect(page.getByTestId("speech-bubble")).toHaveCount(0);
  await send("你喜欢什么？");await expect(page.getByTestId("chat-reply")).toContainText("安静阅读");await aligned("aning");
  await page.getByRole("button",{name:"查看历史",exact:true}).click();await expect(page.getByTestId("chat-turn")).toHaveCount(1);await page.getByRole("button",{name:"关闭历史"}).click();
  await page.getByRole("button",{name:"关闭对话"}).click();await expect(page.getByTestId("speech-bubble")).toHaveCount(0);await expect(page.getByTestId("scene-composer")).toHaveCount(0);
  await page.getByTestId("npc-aqing").click();await expect(page.getByTestId("chat-reply")).toHaveText(first.reply);
  await page.getByRole("button",{name:"展开全文与历史"}).click();await expect(page.getByTestId("chat-turn")).toHaveCount(1);await expect(page.getByTestId("chat-turn")).toContainText(first.reply);await page.getByRole("button",{name:"关闭历史"}).click();
  checks.push("阿宁/阿晴切换无串话，关闭/重开及展开全文均读取持久化历史");
  await page.getByRole("button",{name:"推进一步"}).click();await expect(page.getByTestId("revision")).toHaveText("存档版本 1");await aligned("aqing");
  await send("你现在在干什么？");await expect(page.getByTestId("chat-reply")).toContainText("麦香咖啡馆");await aligned("aqing");
  await page.reload();await expect(page.getByTestId("npc-aqing")).toHaveAttribute("aria-pressed","true");await expect(page.getByTestId("chat-reply")).toContainText("麦香咖啡馆");checks.push("打开聊天仍可推进，人物与气泡一起换到真实地点；刷新恢复选中和已保存消息");
  // A delayed HTTP response is not a model mock: the real fallback endpoint still handles and saves it.
  await page.route("**/api/npcs/aqing/chat",async route=>{if(route.request().method()==="POST"){await new Promise(r=>setTimeout(r,600));}await route.continue();},{times:1});
  const response=page.waitForResponse(r=>r.url().endsWith("/aqing/chat")&&r.request().method()==="POST");
  await page.getByRole("textbox").fill("你好");await page.getByRole("textbox").press("Enter");await expect(page.getByRole("status").filter({hasText:"正在想一想"})).toBeVisible();
  await page.getByTestId("npc-aning").click();await response;await expect(page.getByTestId("speech-bubble")).toHaveAttribute("data-npc","aning");await expect(page.getByTestId("chat-reply")).toContainText("安静阅读");checks.push("等待中切换居民，迟到的阿晴回复不污染阿宁气泡");
  await page.setViewportSize({width:390,height:844});
  await page.waitForFunction(()=>{const v=document.querySelector('[data-testid="scene-viewport"]').getBoundingClientRect();const plane=document.querySelector('[data-testid="world-plane"]');return Math.abs(new DOMMatrix(getComputedStyle(plane).transform).a-Math.min(v.width/960,v.height/600))<.001;});
  await aligned("aning");await page.getByRole("button",{name:"放大地图"}).click();await page.getByRole("button",{name:"复位",exact:true}).click();assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await page.screenshot({path:`${dir}/05-mobile.png`,fullPage:true});checks.push("390px窄屏重新计算位置，无横向页面溢出");
  assert.equal(errors.length,0);await writeFile(`${dir}/result.json`,JSON.stringify({worldId,pid:server.pid,checks,positions,pageErrors:errors,realModelCall:"未执行，显式禁用且清空AI配置",date:new Date().toISOString()},null,2));console.log(`${checks.length} scene chat groups passed.`);
}catch(error){await page?.screenshot({path:`${dir}/scene-failure.png`,fullPage:true});throw error;}
finally{await browser?.close();if(server.exitCode===null)await new Promise(r=>{server.once("exit",r);server.kill();});log.end();}
