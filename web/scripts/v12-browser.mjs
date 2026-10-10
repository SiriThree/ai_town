import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {mkdir,writeFile,rename} from 'node:fs/promises';
import {createWriteStream} from 'node:fs';
import path from 'node:path';
process.env.PLAYWRIGHT_BROWSERS_PATH=path.resolve('.browsers');
const {chromium,expect}=await import('@playwright/test');
const {database}=await import('../src/lib/store.ts');
const {createWorld,populateResidents}=await import('../src/lib/world.ts');
const {buildingIn,portalById,canStand}=await import('../src/lib/scene-data.ts');
const {busyReason}=await import('../src/lib/interaction.ts');
const {findScenePath}=await import('../src/lib/navigation.ts');
const u=new URL(process.env.DATABASE_URL);assert.equal(u.hostname,'127.0.0.1');assert.equal(u.port,'55488');assert.equal(u.pathname,'/ai_town_mvp_test');
const id=`v12-browser-${randomUUID()}`,dir=`evidence/v12/${id}`,base='http://127.0.0.1:3138';
await mkdir(dir,{recursive:true});const log=createWriteStream(`${dir}/server.log`);let server,browser,a,b,p;const errors=[],timeline=[];let targetId="aqing";
const delay=ms=>new Promise(r=>setTimeout(r,ms));
async function start(){server=spawn(process.execPath,['node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port','3138'],{windowsHide:true,stdio:['ignore','pipe','pipe'],env:{...process.env,WORLD_ID:id,PUBLIC_DEMO:'false',AI_ENABLED:'false',NPC_AI_ENABLED:'false',AI_API_KEY:'',AI_BASE_URL:'http://127.0.0.1:1/v1',AI_MODEL:'mock',AI_TEST_MODE:'true',CHAT_REQUESTS_PER_MINUTE:'120'}});server.stdout.pipe(log,{end:false});server.stderr.pipe(log,{end:false});for(let i=0;i<100;i++){try{if((await fetch(base+'/api/world')).ok)return;}catch{}await delay(100);}throw Error('server startup');}
async function stop(){if(server&&server.exitCode===null&&!server.signalCode)await new Promise(r=>{server.once('exit',r);server.kill();});}
const get=async()=>await(await fetch(base+'/api/world')).json();
const current=async()=>(await get()).npcs.find(n=>n.id===targetId);
async function shot(name){await p.screenshot({path:`${dir}/${name}.png`,fullPage:true});}
async function send(message){await p.locator('textarea').fill(message);const response=p.waitForResponse(r=>r.url().endsWith('/'+targetId+'/chat')&&r.request().method()==='POST'&&r.request().postDataJSON().message===message);await p.getByRole('button',{name:'发送消息',exact:true}).click();const r=await response;assert.equal(r.status(),200);const turn=await r.json();await expect(p.locator('textarea')).toHaveValue('');timeline.push({message,turn,worldMinute:(await get()).minute,npc:await current()});return turn;}
async function interact(){await p.getByTestId('scene-viewport').focus();await p.keyboard.press('e');}
async function move(axis,target){
 await p.getByTestId('scene-viewport').focus();const value=()=>p.getByTestId('player').getAttribute(`data-${axis}`).then(Number);let current=await value();
 if(Math.abs(target-current)>10){const positive=target>current,key=axis==='x'?(positive?'d':'a'):(positive?'s':'w');await p.keyboard.down(key);try{await p.waitForFunction(({axis,target,positive})=>{const v=Number(document.querySelector('[data-testid="player"]').dataset[axis]);return positive?v>=target-8:v<=target+8;},{axis,target,positive},{timeout:20000});}finally{await p.keyboard.up(key);}}
 for(let i=0;i<35;i++){current=await value();if(Math.abs(target-current)<=1.8)return;const key=axis==='x'?(target>current?'d':'a'):(target>current?'s':'w');await p.keyboard.down(key);await delay(8);await p.keyboard.up(key);await delay(16);}throw Error(`alignment ${axis} ${target} ${await value()}`);
}
async function walk(to){const el=p.getByTestId('player'),scene=await el.getAttribute('data-scene'),from={x:Number(await el.getAttribute('data-x')),y:Number(await el.getAttribute('data-y'))};const route=findScenePath(scene,from,to);assert.ok(route.length);for(const point of route.slice(1)){await move('x',point.x);await move('y',point.y);}}
try{
 const seed=populateResidents(createWorld());seed.minute=780;seed.revision=0;
 for(const n of seed.npcs)Object.assign(n,{hunger:15,energy:85,mood:n.personality==='quiet'?90:60});seed.npcs.find(n=>n.id==='muxi').energy=20;
 seed.npcs.find(n=>n.id==='laolin').workTask={id:'v12-browser-work',kind:'store',progress:0,phase:'active',createdMinute:780};seed.run={running:false,nextTickAt:null};
 await database().query('INSERT INTO town_worlds(id,revision,payload) VALUES($1,$2,$3)',[id,seed.revision,JSON.stringify(seed)]);
 await start();browser=await chromium.launch({headless:true});a=await browser.newContext({viewport:{width:1440,height:900},recordVideo:{dir,size:{width:1440,height:900}}});
 await a.addInitScript(()=>{if(!sessionStorage.getItem('morning-town:player:v1'))sessionStorage.setItem('morning-town:player:v1',JSON.stringify({version:1,sceneId:'town',position:{x:875,y:358},facing:'north'}));});
 p=await a.newPage();p.on('pageerror',e=>errors.push(e.message));await p.goto(base);await expect(p.getByTestId('scene-canvas')).toHaveAttribute('data-ready','true');await shot('01-board-outside');
 await interact();await expect(p.getByTestId('notice-board')).toBeVisible();await p.getByLabel('公开公告',{exact:true}).fill('今天下午四点，大家来广场聊聊天吧！');await p.getByLabel('世界第几天',{exact:true}).fill('1');await p.getByLabel('开始时刻',{exact:true}).fill('16:00');
 const published=p.waitForResponse(r=>r.url().endsWith('/notices')&&r.request().method()==='POST');await p.getByRole('button',{name:'发布聚会',exact:true}).click();assert.equal((await published).status(),200);await expect(p.getByTestId('public-notice')).toHaveCount(1);await shot('02-notice-responses');
 const initial=await get();assert.deepEqual(new Set(initial.gatherings[0].responses.map(r=>r.status)),new Set(['accepted','declined','deferred']));timeline.push({phase:'announced',world:initial});
 b=await browser.newContext({viewport:{width:1366,height:768}});const peer=await b.newPage();await peer.goto(base);await expect(peer.getByTestId('scene-canvas')).toHaveAttribute('data-ready','true');
 const view=await (await b.request.get(base+'/api/world/notices')).json();assert.deepEqual(view.ownedIds,[]);assert.deepEqual(view.world.gatherings,initial.gatherings);
 const forbidden=await b.request.post(base+'/api/world/notices',{headers:{origin:base},data:{action:'cancel',id:initial.gatherings[0].id,requestId:randomUUID()}});assert.equal(forbidden.status(),403);
 await p.getByRole('button',{name:'关闭公告板',exact:true}).click();await walk({x:510,y:368});await p.getByRole('button',{name:'开始自动运行',exact:true}).click();
 await expect.poll(async()=>{const w=await get();return w.gatherings[0].responses.some(r=>r.status==='travelling');},{timeout:145000,intervals:[500]}).toBe(true);timeline.push({phase:'travelling',world:await get()});await shot('03-real-route');
 await expect.poll(async()=>{const w=await get();return w.gatherings[0].responses.filter(r=>r.status==='participated').length;},{timeout:85000,intervals:[500]}).toBeGreaterThanOrEqual(2);await shot('04-actual-participants');timeline.push({phase:'participated',world:await get()});
 await expect.poll(async()=>{const w=await get();return w.conversations?.some(c=>c.minute>=960);},{timeout:25000,intervals:[250]}).toBe(true);await shot('05-natural-conversation');
 await expect.poll(async()=>(await get()).gatherings[0].status,{timeout:50000,intervals:[500]}).toBe('ended');await p.getByRole('button',{name:'暂停自动运行',exact:true}).click();await expect.poll(async()=>(await get()).run.running).toBe(false);const ended=await get();timeline.push({phase:'ended',world:ended});await shot('06-ended');
 await walk({x:875,y:358});await interact();await expect(p.getByTestId('notice-board')).toContainText('聚会已结束');await shot('07-result-board');await p.getByRole('button',{name:'关闭公告板',exact:true}).click();
 // Fast manual API steps for next-day recall; not offline simulation or changing the saved clock.
 let w=await get();while(w.minute<1920){const r=await a.request.post(base+'/api/world/tick',{headers:{origin:base},data:{expectedRevision:w.revision}});assert.equal(r.status(),200);w=await r.json();}
 const ids=ended.gatherings[0].responses.filter(r=>r.status==='participated').map(r=>r.npcId);
 for(let i=0;i<40&&!w.npcs.some(n=>ids.includes(n.id)&&!busyReason(n,w));i++){const r=await a.request.post(base+'/api/world/tick',{headers:{origin:base},data:{expectedRevision:w.revision}});assert.equal(r.status(),200);w=await r.json();}
 const target=w.npcs.find(n=>ids.includes(n.id)&&!busyReason(n,w));assert.ok(target);targetId=target.id;
 await stop();await start();assert.deepEqual(await get(),w);await p.reload();await expect(p.getByTestId('scene-canvas')).toHaveAttribute('data-ready','true');await p.keyboard.press('Escape');
 if(target.sceneId!=='town'){const building=buildingIn(target.sceneId);await walk(portalById(building.exit).spawn);await interact();await expect(p.getByTestId('scene-canvas')).toHaveAttribute('data-scene',target.sceneId);}
 const from={x:Number(await p.getByTestId('player').getAttribute('data-x')),y:Number(await p.getByTestId('player').getAttribute('data-y'))};
 const destination=[{x:target.position.x+35,y:target.position.y},{x:target.position.x-35,y:target.position.y},{x:target.position.x,y:target.position.y+35},target.position].find(pos=>canStand(target.sceneId,pos)&&findScenePath(target.sceneId,from,pos).length);assert.ok(destination);await walk(destination);await interact();await expect(p.getByTestId('scene-composer')).toContainText(target.name);
 const reply=await send('还记得昨天的广场聚会吗？');assert.match(reply.reply,/参加过/);await shot('08-next-day-memory');
 const other=await (await b.request.get(base+'/api/npcs/'+targetId+'/chat')).json();assert.deepEqual(other.turns,[]);assert.deepEqual(other.appointments,[]);
 assert.equal(errors.length,0);await writeFile(`${dir}/result.json`,JSON.stringify({id,externalCalls:0,mode:'Fallback',timeline,ended,finalWorld:await get(),errors,checks:['E real board','server publish','different intents','two browser same public state','owner cancellation enforced','real automatic travel and participation','natural conversation','ended result','next day manual clock ticks','app restart exact restore','nearby E factual recall','private history isolation']},null,2));
 const video=p.video();await a.close();a=null;await rename(await video.path(),`${dir}/journey.webm`);console.log(JSON.stringify({dir,passed:true,externalCalls:0}));
}catch(e){await p?.screenshot({path:`${dir}/failure.png`,fullPage:true});await writeFile(`${dir}/failure.json`,JSON.stringify({id,timeline,errors,error:String(e)},null,2));throw e;}finally{await a?.close();await b?.close();await browser?.close();await stop();log.end();await database().end();}
