import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {mkdir,writeFile,rename} from 'node:fs/promises';
import {createWriteStream} from 'node:fs';
import {createServer} from 'node:http';
import path from 'node:path';
process.env.PLAYWRIGHT_BROWSERS_PATH=path.resolve('.browsers');
const {chromium,expect}=await import('@playwright/test');
const {database}=await import('../src/lib/store.ts');
const {createWorld,populateResidents}=await import('../src/lib/world.ts');
const {findScenePath}=await import('../src/lib/navigation.ts');
const url=new URL(process.env.DATABASE_URL||'');assert.equal(url.hostname,'127.0.0.1');assert.equal(url.port,'55488');assert.equal(url.pathname,'/ai_town_mvp_test');
const stage=process.env.V11_STAGE||'memory',dir=process.env.EVIDENCE_DIR||`evidence/v11/${stage}-browser`,extended=process.env.V11_EXTENDED==='true',id=`v11-${randomUUID()}`,base='http://127.0.0.1:3126';
await mkdir(dir,{recursive:true});const log=createWriteStream(`${dir}/server.log`);let server,browser,a,b,p,calls=0;const checks=[],errors=[],contexts=[];
const delay=ms=>new Promise(r=>setTimeout(r,ms));
let mode='normal';
const model=createServer(async(req,res)=>{let raw='';for await(const chunk of req)raw+=chunk;calls++;
 const body=JSON.parse(raw);contexts.push(body.messages);
 if(mode==='timeout'){setTimeout(()=>res.end('{}'),4000).unref();return;}
 if(mode==='failure'){res.writeHead(503);res.end('{}');return;}
 const facts=JSON.parse(body.messages[0].content.split('世界事实：\n')[1]),m=facts.playerAcquaintance;
 const reply=body.messages.at(-1).content==='你为什么来这里？'&&facts.privateAppointments[0]?.status==='arrived'?'我按你的邀请来咖啡馆，已经到了。':m?.meetings?`记得${m.name?'，'+m.name:''}，第${Math.floor(m.first.minute/1440)+1}天我们聊过。`:'我们还没见过，你愿意介绍一下吗？';
 res.setHeader('content-type','application/json');res.end(JSON.stringify({choices:[{message:{content:reply}}]}));
});
await new Promise(r=>model.listen(3196,'127.0.0.1',r));
async function start(){server=spawn(process.execPath,['node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port','3126'],{windowsHide:true,stdio:['ignore','pipe','pipe'],env:{...process.env,WORLD_ID:id,PUBLIC_DEMO:'false',AI_ENABLED:'true',NPC_AI_ENABLED:'false',AI_API_KEY:'local-test-only',AI_BASE_URL:'http://127.0.0.1:3196/v1',AI_MODEL:'mock',AI_TEST_MODE:'true',AI_TIMEOUT_MS:extended?'1800':'600',AI_CALLS_PER_DAY:'20',CHAT_REQUESTS_PER_MINUTE:'120'}});server.stdout.pipe(log,{end:false});server.stderr.pipe(log,{end:false});for(let i=0;i<100;i++){try{if((await fetch(base+'/api/world')).ok)return;}catch{}await delay(100);}throw Error('server timeout');}
async function stop(){if(server&&server.exitCode===null&&!server.signalCode)await new Promise(r=>{server.once('exit',r);server.kill();});}
async function send(message){await p.locator('textarea').fill(message);const result=p.waitForResponse(r=>r.url().endsWith('/aning/chat')&&r.request().method()==='POST');await p.getByRole('button',{name:'发送消息',exact:true}).click();const r=await result;assert.equal(r.status(),200);const turn=await r.json();await expect(p.locator('textarea')).toHaveValue('');return turn;}
const get=async()=>await(await fetch(base+'/api/world')).json();
async function move(axis,target){
 await p.getByTestId('scene-viewport').focus();const value=()=>p.getByTestId('player').getAttribute(`data-${axis}`).then(Number);let current=await value();
 if(Math.abs(target-current)>10){const positive=target>current,key=axis==='x'?(positive?'d':'a'):(positive?'s':'w');await p.keyboard.down(key);try{await p.waitForFunction(({axis,target,positive})=>{const v=Number(document.querySelector('[data-testid="player"]').dataset[axis]);return positive?v>=target-8:v<=target+8;},{axis,target,positive},{timeout:20000});}finally{await p.keyboard.up(key);}}
 for(let i=0;i<35;i++){current=await value();if(Math.abs(target-current)<=1.8)return;const key=axis==='x'?(target>current?'d':'a'):(target>current?'s':'w');await p.keyboard.down(key);await delay(8);await p.keyboard.up(key);await delay(16);}throw Error(`alignment ${axis} ${target} ${await value()}`);
}
async function walk(to){const el=p.getByTestId('player'),scene=await el.getAttribute('data-scene'),from={x:Number(await el.getAttribute('data-x')),y:Number(await el.getAttribute('data-y'))};const route=findScenePath(scene,from,to);assert.ok(route.length);for(const point of route.slice(1)){await move('x',point.x);await move('y',point.y);}}
try{
 const seed=populateResidents(createWorld());for(const n of seed.npcs)Object.assign(n,{hunger:20,energy:85,mood:95});seed.run={running:false,nextTickAt:null};
 await database().query('INSERT INTO town_worlds(id,revision,payload) VALUES($1,$2,$3)',[id,seed.revision,JSON.stringify(seed)]);
 await start();browser=await chromium.launch({headless:true});a=await browser.newContext({viewport:{width:1440,height:900},recordVideo:{dir,size:{width:1440,height:900}}});
 await a.addInitScript(()=>{if(!sessionStorage.getItem('morning-town:player:v1'))sessionStorage.setItem('morning-town:player:v1',JSON.stringify({version:1,sceneId:'town',position:{x:524,y:418},facing:'north'}));});
 p=await a.newPage();p.on('pageerror',e=>errors.push(e.message));await p.goto(base);await expect(p.getByTestId('scene-canvas')).toHaveAttribute('data-ready','true');
 await p.screenshot({path:`${dir}/01-town.png`,fullPage:true});
 await p.getByTestId('scene-viewport').focus();await p.keyboard.press('e');await expect(p.getByTestId('scene-composer')).toContainText('阿宁');
 assert.match((await send('你还记得我吗')).reply,/还没见过/);
 await send('我叫小舟');assert.match((await send('你还记得我吗')).reply,/小舟/);
 await p.screenshot({path:`${dir}/02-recognition.png`,fullPage:true});
 await p.getByRole('button',{name:'查看历史',exact:true}).click();await p.screenshot({path:`${dir}/03-history.png`,fullPage:true});await p.getByRole('button',{name:'关闭历史',exact:true}).click();
 b=await browser.newContext();await b.request.get(base+'/api/npcs/aning/chat');assert.deepEqual((await(await b.request.get(base+'/api/npcs/aning/chat')).json()).turns,[]);
 const outsider=await b.request.post(base+'/api/npcs/aning/chat',{headers:{origin:base},data:{message:'你还记得我吗',visitorId:'a'.repeat(64)}});assert.match((await outsider.json()).reply,/还没见过/);
 const before=await get();await stop();await start();assert.deepEqual(await get(),before);await p.reload();await expect(p.getByTestId('scene-canvas')).toHaveAttribute('data-ready','true');await p.getByTestId('scene-viewport').focus();await p.getByRole('button',{name:'靠近后与阿宁对话',exact:true}).click();await expect(p.getByTestId('scene-composer')).toBeVisible();
 assert.match((await send('你还记得我吗')).reply,/小舟/);checks.push('first/repeat/refresh/backend restart real browser private recognition; second cookie cannot read or impersonate');
 for(const testMode of ['failure','timeout']){mode=testMode;const t=await send('你还记得我吗');assert.equal(t.source,'fallback');assert.match(t.reply,/小舟/);assert.equal(t.reason,testMode==='failure'?'service_error':'timeout');}mode='normal';
 await p.screenshot({path:`${dir}/04-fallback.png`,fullPage:true});checks.push('model 503/timeout preserve truthful private memory; no external model');
 assert.deepEqual(await get(),before);assert.equal(errors.length,0);assert.ok(contexts.some(ms=>ms[0].content.includes('"name":"小舟"')));
 if(stage!=='memory'){
  const invitation=await send('我们一起去咖啡馆吧');assert.equal(invitation.reason,'controlled_action');
  await p.screenshot({path:`${dir}/05-invitation.png`,fullPage:true});
  const accepted=await get();assert.equal(accepted.npcs[1].appointment.status,'accepted');await stop();await start();assert.deepEqual(await get(),accepted);
  await p.getByRole('button',{name:'开始自动运行',exact:true}).click();
  await expect.poll(async()=>(await get()).npcs[1].appointment.status,{timeout:12000}).toBe('arrived');
  await p.getByRole('button',{name:'暂停自动运行',exact:true}).click();await expect.poll(async()=>(await get()).run.running).toBe(false);
  const arrived=await get();assert.equal(arrived.npcs[1].sceneId,'cafe_interior');
  await p.getByTestId('scene-viewport').focus();await p.keyboard.press('Escape');await walk({x:762,y:324});await p.keyboard.press('e');await expect(p.getByTestId('scene-canvas')).toHaveAttribute('data-scene','cafe_interior');
  await move('y',450);await p.keyboard.press('e');await expect(p.getByTestId('scene-composer')).toContainText('阿宁');
  assert.match((await send('还记得我们的约定吗')).reply,/按约到了/);
  if(extended){const t=await send('你为什么来这里？');assert.equal(t.source,'ai');assert.equal(t.testMode,true);assert.match(t.reply,/按你的邀请/);await expect(p.getByTestId('meeting-feedback')).toContainText('阿宁已经到了');}
  await p.screenshot({path:`${dir}/06-meeting.png`,fullPage:true});
  const own=await(await a.request.get(base+'/api/npcs/aning/chat')).json();assert.equal(own.appointments[0].status,'arrived');
  const other=await(await b.request.get(base+'/api/npcs/aning/chat')).json();assert.deepEqual(other.appointments,[]);
  checks.push('browser invite, pending backend restart, automatic real road/portal arrival; player walks from square into cafe, private completed meeting recalled');
 }
 if(stage==='game-ui'){
  await expect(p.getByTestId('reply-source')).toHaveCount(0);await expect(p.getByTestId('revision')).toHaveCount(0);await expect(p.locator('.residents')).toHaveCount(0);
  const bubble=await p.getByTestId('speech-bubble').boundingBox(),dock=await p.getByTestId('scene-composer').boundingBox();assert.ok(bubble.height<=105&&bubble.width<=265);assert.ok(dock.width<=700&&dock.height<180);
  await p.getByRole('button',{name:'查看历史',exact:true}).click();await expect(p.getByTestId('chat-turn')).toHaveCount(extended?9:8);await p.screenshot({path:`${dir}/07-game-history.png`,fullPage:true});await p.getByRole('button',{name:'关闭历史',exact:true}).click();
  await p.getByRole('button',{name:'帮助',exact:true}).click();await p.getByRole('checkbox',{name:'开发诊断',exact:true}).check();await p.getByRole('button',{name:'关闭帮助',exact:true}).click();
  await expect(p.getByTestId('reply-source')).toContainText(extended?'本地测试替身':'后台确认');await expect(p.getByTestId('revision')).toBeVisible();await p.screenshot({path:`${dir}/08-diagnostics.png`,fullPage:true});
  await p.getByRole('button',{name:'帮助',exact:true}).click();await p.getByRole('checkbox',{name:'开发诊断',exact:true}).uncheck();await p.getByRole('button',{name:'关闭帮助',exact:true}).click();
  const avatar=p.getByTestId('player'),pos=await avatar.getAttribute('data-y');await p.locator('textarea').fill('wasd');await p.locator('textarea').press('ArrowUp');assert.equal(await avatar.getAttribute('data-y'),pos);await p.locator('textarea').fill('');
  await p.getByRole('button',{name:'居民档案',exact:true}).click();const hunger=Number(await p.getByTestId('stat-hunger').textContent());await p.getByRole('button',{name:/^送食物/}).click();await expect(p.getByTestId('stat-hunger')).toHaveText(String(Math.max(0,hunger-35)));await p.screenshot({path:`${dir}/09-profile-food.png`,fullPage:true});
  await p.getByRole('button',{name:'关闭档案',exact:true}).click();await p.getByRole('button',{name:'关闭对话',exact:true}).click();
  await p.setViewportSize({width:1366,height:768});await p.screenshot({path:`${dir}/10-1366.png`,fullPage:true});
  checks.push('normal UI no model/version/status parade; compact bubble/input; full history; explicit diagnostics restores sources; focus isolation, real feed and 1366 viewport');
 }
 if(extended){
  await p.getByTestId('scene-viewport').focus();await p.keyboard.press('e');await expect(p.getByTestId('scene-composer')).toBeVisible();
  mode='timeout';await p.getByRole('button',{name:'开始自动运行',exact:true}).click();const waitingWorld=await get();
  await p.locator('textarea').fill('你还记得我吗');const response=p.waitForResponse(r=>r.url().endsWith('/aning/chat')&&r.request().method()==='POST');
  await p.getByRole('button',{name:'发送消息',exact:true}).click();await expect(p.locator('.chat-wait')).toBeVisible();
  await p.screenshot({path:`${dir}/11-waiting-auto.png`,fullPage:true});
  await p.getByRole('button',{name:'关闭对话',exact:true}).click();await move('x',530);
  const t=await(await response).json();assert.equal(t.reason,'timeout');mode='normal';
  await expect.poll(async()=>(await get()).minute,{timeout:5000}).toBeGreaterThan(waitingWorld.minute);
  await p.getByRole('button',{name:'暂停自动运行',exact:true}).click();const releasedWorld=await get();
  await p.screenshot({path:`${dir}/12-exit-during-wait.png`,fullPage:true});
  const saved=(await(await a.request.get(base+'/api/npcs/aning/chat')).json()).turns.at(-1);assert.equal(saved.id,t.id);
  await writeFile(`${dir}/wait-timeline.json`,JSON.stringify({waitingWorld,releasedWorld,turn:t,closedDuringRequest:true,playerX:Number(await p.getByTestId('player').getAttribute('data-x'))},null,2));
  checks.push('active model timeout: close composer, keyboard move, automatic clock/NPC progression and saved fallback all continue; no lingering occupation');
 }
 await writeFile(`${dir}/result.json`,JSON.stringify({id,checks,calls,externalCalls:0,errors,...(extended?{modelContexts:contexts}: {})},null,2));
 const video=p.video();await a.close();a=null;await rename(await video.path(),`${dir}/journey.webm`);console.log(JSON.stringify({id,checks,calls}));
}catch(error){await p?.screenshot({path:`${dir}/failure.png`,fullPage:true});throw error;}finally{await a?.close();await b?.close();await browser?.close();await stop();model.closeAllConnections();await new Promise(r=>model.close(r));log.end();await database().end();}
