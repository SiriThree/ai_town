// Actual browser regression, isolated PostgreSQL world and loopback-only model.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {mkdir,writeFile,rename} from 'node:fs/promises';
import {createWriteStream} from 'node:fs';
import {createServer} from 'node:http';
import path from 'node:path';
process.env.PLAYWRIGHT_BROWSERS_PATH=path.resolve('.browsers');
const {chromium,expect}=await import('@playwright/test');
const url=new URL(process.env.DATABASE_URL||'');
assert.equal(url.hostname,'127.0.0.1');assert.equal(url.port,'55488');assert.equal(url.pathname,'/ai_town_mvp_test');
const {database}=await import('../src/lib/store.ts');
const {createWorld,populateResidents,assertWorld}=await import('../src/lib/world.ts');
const {findScenePath}=await import('../src/lib/navigation.ts');
const before=process.argv.includes('--before'),dir=process.env.EVIDENCE_DIR||`evidence/v10-4/${before?'before':'after'}`;
const id=`v10-4-${randomUUID()}`,base='http://127.0.0.1:3124';
await mkdir(dir,{recursive:true});const log=createWriteStream(`${dir}/server.log`);
let server,browser,context,a,mode='normal',calls=0;const timeline=[],checks=[],errors=[];
const delay=ms=>new Promise(r=>setTimeout(r,ms));
const model=createServer(async(req,res)=>{for await(const ignored of req){void ignored;}calls++;
 if(mode==='timeout'){setTimeout(()=>res.end('{}'),6000).unref();return;}
 if(mode==='failure'){res.writeHead(503);res.end('{}');return;}
 await delay(800);res.setHeader('Content-Type','application/json');res.end(JSON.stringify({choices:[{message:{content:'我在广场歇一会儿，待会儿再去吃点东西。'}}]}));
});
await new Promise(r=>model.listen(3195,'127.0.0.1',r));
async function start(){server=spawn(process.execPath,['node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port','3124'],{windowsHide:true,stdio:['ignore','pipe','pipe'],env:{...process.env,WORLD_ID:id,PUBLIC_DEMO:'false',AI_ENABLED:'true',NPC_AI_ENABLED:'false',AI_API_KEY:'local-test-only',AI_BASE_URL:'http://127.0.0.1:3195/v1',AI_MODEL:'mock',AI_TEST_MODE:'true',AI_TIMEOUT_MS:'2500',AI_CALLS_PER_DAY:'20'}});server.stdout.pipe(log,{end:false});server.stderr.pipe(log,{end:false});for(let i=0;i<100;i++){try{if((await fetch(base+'/api/world')).ok)return;}catch{}await delay(100);}throw Error('start timeout');}
async function stop(){if(server&&server.exitCode===null&&!server.signalCode)await new Promise(r=>{server.once('exit',r);server.kill();});}
const get=async()=>await(await fetch(base+'/api/world')).json();
async function post(route,body){const r=await fetch(base+route,{method:'POST',headers:{'content-type':'application/json',origin:base},body:JSON.stringify(body)});assert.ok(r.ok,await r.clone().text());return r.json();}
async function run(running){await post('/api/world/run',{running,expectedRevision:(await get()).revision});await delay(1100);}
async function sample(phase,seconds){for(let i=0;i<seconds;i++){await delay(1000);const w=await get();assertWorld(w);timeline.push({phase,at:new Date().toISOString(),revision:w.revision,minute:w.minute,npcs:w.npcs.map(n=>({id:n.id,position:n.position,scene:n.sceneId,action:n.action,actionId:n.ongoing?.id,elapsedMs:n.ongoing?.elapsedMs,hunger:n.hunger,energy:n.energy}))});}}
async function shot(name){await a.screenshot({path:`${dir}/${name}.png`,fullPage:true});}
async function move(axis,target){
 await a.getByTestId('scene-viewport').focus();const value=()=>a.getByTestId('player').getAttribute(`data-${axis}`).then(Number);let current=await value();
 if(Math.abs(target-current)>12){const positive=target>current,key=axis==='x'?(positive?'d':'a'):(positive?'s':'w');await a.keyboard.down(key);try{await a.waitForFunction(({axis,target,positive})=>{const v=Number(document.querySelector('[data-testid="player"]').dataset[axis]);return positive?v>=target-10:v<=target+10;},{axis,target,positive},{timeout:30000});}finally{await a.keyboard.up(key);}}
 for(let i=0;i<30;i++){current=await value();if(Math.abs(target-current)<=1.8)return;const positive=target>current,key=axis==='x'?(positive?'d':'a'):(positive?'s':'w');await a.keyboard.down(key);await delay(8);await a.keyboard.up(key);await delay(16);}throw Error(`alignment ${axis} ${target} ${await value()}`);
}
async function walk(to){const el=a.getByTestId('player'),scene=await el.getAttribute('data-scene'),from={x:Number(await el.getAttribute('data-x')),y:Number(await el.getAttribute('data-y'))};const route=findScenePath(scene,from,to);assert.ok(route.length>1,JSON.stringify({scene,from,to}));for(const p of route.slice(1)){await move('x',p.x);await move('y',p.y);}}
async function e(scene){await a.getByTestId('scene-viewport').focus();await a.keyboard.press('e');if(scene)await expect(a.getByTestId('scene-canvas')).toHaveAttribute('data-scene',scene);}
async function fixture(position){
 // Local avatar-only fixture for same-camera before/after; all journeys after this use keys.
 const c=await browser.newContext({viewport:{width:1440,height:900},recordVideo:{dir,size:{width:1440,height:900}}});
 await c.addInitScript(p=>{if(!sessionStorage.getItem('morning-town:player:v1'))sessionStorage.setItem('morning-town:player:v1',JSON.stringify({version:1,sceneId:'town',position:p,facing:'south'}));},position);
 a=await c.newPage();a.on('pageerror',err=>errors.push(err.message));await a.goto(base);await expect(a.getByTestId('scene-canvas')).toHaveAttribute('data-ready','true');return c;
}
async function saveVideo(name){const video=a.video();await context.close();context=null;await rename(await video.path(),`${dir}/${name}.webm`);}
try{
 const seed=populateResidents(createWorld());seed.run={running:false,nextTickAt:null};
 for(const n of seed.npcs)Object.assign(n,{hunger:20,energy:85,mood:95});seed.npcs[0].hunger=64;
 await database().query('INSERT INTO town_worlds(id,revision,payload) VALUES($1,$2,$3)',[id,seed.revision,JSON.stringify(seed)]);
 await start();browser=await chromium.launch({headless:true});context=await fixture({x:420,y:390});
 await a.getByTestId('npc-aqing').click();await expect(a.getByTestId('profile')).toBeVisible();await a.getByRole('button',{name:'开始自动运行',exact:true}).click();await sample('profile-only',5);await shot('01-profile-running');await run(false);await a.keyboard.press('Escape');
 await e();await expect(a.getByTestId('scene-composer')).toBeVisible();if(!before)await expect(a.getByTestId('interaction-feedback')).toContainText('尚未发送');await run(true);await sample('composer-idle',5);await shot('02-idle-running');await run(false);
 await a.locator('textarea').fill('你现在在干什么？');await a.getByRole('button',{name:'发送消息',exact:true}).click();await expect(a.getByTestId('reply-source')).toContainText('本地测试替身');await shot('03-reply');
 if(!before)await expect(a.getByTestId('interaction-feedback')).toContainText('本轮回复已完成');
 await run(true);await sample('after-reply-open',18);await shot('04-resumed');
 const qing=(await get()).npcs[0];assert.notDeepEqual(qing.position,seed.npcs[0].position);assert.ok(timeline.some(t=>t.phase==='after-reply-open'&&t.npcs[0].action.includes('行走')));
 await a.keyboard.press('Escape');await sample('closed',3);
 // Same real HTTP/private storage, controlled error and timeout while world keeps running.
 for(const testMode of ['failure','timeout']){
  mode=testMode;const beforeWorld=await get();const pending=a.request.post(base+'/api/npcs/aning/chat',{headers:{origin:base},data:{message:'你还好吗？'}});
  await sample(`model-${testMode}`,3);const r=await pending;assert.ok(r.ok());const reply=await r.json();assert.equal(reply.reason,testMode==='timeout'?'timeout':'service_error');assert.ok((await get()).minute>beforeWorld.minute);
  mode='normal';const again=await a.request.post(base+'/api/npcs/aning/chat',{headers:{origin:base},data:{message:'再打个招呼'}});assert.ok(again.ok(),'advisory reply lock released');
 }
 await run(false);const paused=await get();await stop();await start();assert.deepEqual(await get(),paused);await a.reload();await expect(a.getByTestId('scene-canvas')).toHaveAttribute('data-ready','true');await shot('05-restored');await saveVideo('conversation-timeline');
 checks.push('profile/empty composer/private reply never freeze world; actual NPC changes action and position; 503/timeout release reply lock; backend restart exact saved state');
 if(!before){
  const aning=paused.npcs.find(n=>n.id==='aning');context=await fixture({x:aning.position.x,y:aning.position.y+24});
  await e();await expect(a.getByTestId('scene-composer')).toContainText('阿宁');mode='timeout';const priorCalls=calls;
  await a.locator('textarea').fill('请稍等，我要离开页面');await a.getByRole('button',{name:'发送消息',exact:true}).click();
  await expect.poll(()=>calls).toBeGreaterThan(priorCalls);
  const visitor=await browser.newContext();await visitor.request.get(base+'/api/npcs/aning/chat');
  const conflict=await visitor.request.post(base+'/api/npcs/aning/chat',{headers:{origin:base},data:{message:'另一访客同时来访'}});assert.equal(conflict.status(),409);
  await saveVideo('close-during-reply');await delay(3000);mode='normal';
  const recovered=await visitor.request.post(base+'/api/npcs/aning/chat',{headers:{origin:base},data:{message:'之前的回复锁已经释放吗？'}});assert.equal(recovered.status(),200);
  mode='timeout';const oldCalls=calls;const interrupted=visitor.request.post(base+'/api/npcs/aning/chat',{headers:{origin:base},data:{message:'重启期间的待处理消息'}}).catch(()=>null);
  await expect.poll(()=>calls).toBeGreaterThan(oldCalls);await stop();await interrupted;mode='normal';await start();
  const restarted=await visitor.request.post(base+'/api/npcs/aning/chat',{headers:{origin:base},data:{message:'重启后再次交谈'}});assert.equal(restarted.status(),200);assert.deepEqual(await get(),paused);await visitor.close();
  checks.push('two visitors same NPC: 409 during reply; closing browser and killing waiting backend both release reply lock; world unchanged');
 }
 context=await fixture({x:1670,y:1000});await shot('06-workshop');
 await walk({x:1875,y:1160});await shot('07-bridge');await walk({x:1670,y:974});await e('workshop_interior');await e('town');await saveVideo('workshop-walk');
 context=await fixture({x:2410,y:1162});await a.getByTestId('scene-viewport').focus();await a.keyboard.down('s');await delay(1800);await a.keyboard.up('s');
 const sideY=Number(await a.getByTestId('player').getAttribute('data-y'));await shot('08-stone-west');
 if(before){assert.ok(sideY<1200);checks.push(`left approach blocked at y=${sideY}; doorway itself reachable via east detour`);}
 else{assert.ok(sideY>1230);await walk({x:2530,y:1234});await expect(a.getByTestId('portal-hint')).toHaveAttribute('data-target','stone-door');await e('stone_interior');await shot('09-stone-interior');await e('town');
  for(const from of [{x:2700,y:1300},{x:2530,y:1300},{x:2410,y:1162}]){await walk(from);await walk({x:2530,y:1234});await e('stone_interior');await e('town');}
  checks.push('west/east/front approaches enter stone room and return safely');}
 await saveVideo('stone-approaches');assert.deepEqual(errors,[]);
 await writeFile(`${dir}/result.json`,JSON.stringify({id,before,checks,timeline,errors,calls,externalPaidCalls:0},null,2));console.log('V10.4 browser',checks);
}catch(error){await writeFile(`${dir}/timeline.json`,JSON.stringify(timeline,null,2));if(a&&!a.isClosed())await shot('failure');throw error;}
finally{await context?.close();await browser?.close();await stop();model.closeAllConnections();await new Promise(r=>model.close(r));await database().end();log.end();}
