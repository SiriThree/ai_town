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
const {findScenePath}=await import('../src/lib/navigation.ts');
const u=new URL(process.env.DATABASE_URL);assert.equal(u.hostname,'127.0.0.1');assert.equal(u.port,'55488');assert.equal(u.pathname,'/ai_town_mvp_test');
const id=`v11-6-browser-${randomUUID()}`,dir=`evidence/v11-6/${id}`,base='http://127.0.0.1:3136';
await mkdir(dir,{recursive:true});const log=createWriteStream(`${dir}/server.log`);let server,browser,a,b,p;const errors=[],timeline=[];let cookieCreations=0;const cookieChecks=[];
const delay=ms=>new Promise(r=>setTimeout(r,ms));
async function start(){server=spawn(process.execPath,['node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port','3136'],{windowsHide:true,stdio:['ignore','pipe','pipe'],env:{...process.env,WORLD_ID:id,PUBLIC_DEMO:'false',AI_ENABLED:'false',NPC_AI_ENABLED:'false',AI_API_KEY:'',AI_BASE_URL:'http://127.0.0.1:1/v1',AI_MODEL:'mock',AI_TEST_MODE:'true',CHAT_REQUESTS_PER_MINUTE:'120'}});server.stdout.pipe(log,{end:false});server.stderr.pipe(log,{end:false});for(let i=0;i<100;i++){try{if((await fetch(base+'/api/world')).ok)return;}catch{}await delay(100);}throw Error('server startup');}
async function stop(){if(server&&server.exitCode===null&&!server.signalCode)await new Promise(r=>{server.once('exit',r);server.kill();});}
const get=async()=>await(await fetch(base+'/api/world')).json();
const current=async()=>(await get()).npcs.find(n=>n.id==='xiaoman');
async function shot(name){await p.screenshot({path:`${dir}/${name}.png`,fullPage:true});}
async function send(message){await p.locator('textarea').fill(message);const response=p.waitForResponse(r=>r.url().endsWith('/xiaoman/chat')&&r.request().method()==='POST'&&r.request().postDataJSON().message===message);await p.getByRole('button',{name:'发送消息',exact:true}).click();const r=await response;assert.equal(r.status(),200);const turn=await r.json();await expect(p.locator('textarea')).toHaveValue('');timeline.push({message,turn,worldMinute:(await get()).minute,npc:await current()});return turn;}
async function interact(){await p.getByTestId('scene-viewport').focus();await p.keyboard.press('e');}
async function closeChat(){await p.keyboard.press('Escape');await expect(p.getByTestId('scene-composer')).toHaveCount(0);}
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
 await a.addInitScript(()=>{if(!sessionStorage.getItem('morning-town:player:v1'))sessionStorage.setItem('morning-town:player:v1',JSON.stringify({version:1,sceneId:'town',position:{x:558,y:340},facing:'west'}));});
 p=await a.newPage();p.on('pageerror',e=>errors.push(e.message));p.on('response',r=>{if(r.url().endsWith('/xiaoman/chat'))cookieChecks.push(r.headerValue('set-cookie').then(value=>{if(value?.includes('town_session='))cookieCreations++;}));});await p.goto(base);await expect(p.getByTestId('scene-canvas')).toHaveAttribute('data-ready','true');
 await interact();await expect(p.getByTestId('scene-composer')).toContainText('小满');
 assert.match((await send('我叫 three，你记住了吗？')).reply,/three/);await shot('01-name');
 await closeChat();await walk({x:762,y:324});await interact();await expect(p.getByTestId('scene-canvas')).toHaveAttribute('data-scene','cafe_interior');await move('y',450);await shot('02-left-scene');
 await move('y',486);await interact();await expect(p.getByTestId('scene-canvas')).toHaveAttribute('data-scene','town');await walk({x:558,y:340});await interact();await expect(p.getByTestId('scene-composer')).toContainText('小满');
 assert.match((await send('你还认识我吗？')).reply,/three/);assert.match((await send('我叫什么名字？')).reply,/three/);await shot('03-remember-name');
 await send('待会你有空吗？我想邀请你去咖啡馆喝杯咖啡。');assert.equal((await current()).appointment,undefined);await shot('04-time-proposal');
 await send('好的');const agreement=(await current()).appointment;assert.equal(agreement.status,'accepted');await send('你什么时候过来呢？');await shot('05-confirmed-time');
 await closeChat();await p.getByRole('button',{name:'开始自动运行',exact:true}).click();await walk({x:762,y:324});
 await expect.poll(async()=>(await current()).appointment.status,{timeout:60000,intervals:[250]}).toBe('travelling');await shot('06-moving');
 await p.getByRole('button',{name:'暂停自动运行',exact:true}).click();await expect.poll(async()=>(await get()).run.running).toBe(false);const paused=await get();await shot('07-paused');
 await stop();await start();assert.deepEqual(await get(),paused);await p.reload();await expect(p.getByTestId('scene-canvas')).toHaveAttribute('data-ready','true');assert.equal((await current()).appointment.id,agreement.id);await p.keyboard.press('Escape');
 await p.getByRole('button',{name:'开始自动运行',exact:true}).click();await expect.poll(async()=>(await current()).appointment.status,{timeout:30000,intervals:[250]}).toBe('arrived');
 await p.getByRole('button',{name:'暂停自动运行',exact:true}).click();await expect.poll(async()=>(await get()).run.running).toBe(false);const arrived=await current();assert.equal(arrived.appointment.metMinute,undefined);
 await interact();await expect(p.getByTestId('scene-canvas')).toHaveAttribute('data-scene','cafe_interior');await move('x',492);await move('y',450);await interact();await expect(p.getByTestId('scene-composer')).toContainText('小满');
 await expect.poll(async()=>(await current()).appointment.status,{timeout:10000}).toBe('met');await expect(p.getByTestId('meeting-feedback')).toContainText('见过面');
 assert.match((await send('我叫什么名字？')).reply,/three/);assert.match((await send('还记得我们的约定吗？')).reply,/见面/);await shot('08-real-meeting');
 await p.getByRole('button',{name:'查看历史',exact:true}).click();await shot('09-history');await p.getByRole('button',{name:'关闭历史',exact:true}).click();
 b=await browser.newContext();const other=await(await b.request.get(base+'/api/npcs/xiaoman/chat')).json();assert.deepEqual(other.turns,[]);assert.deepEqual(other.appointments,[]);
 const outsider=await b.request.post(base+'/api/npcs/xiaoman/chat',{headers:{origin:base},data:{message:'我叫什么名字？',visitorId:'a'.repeat(64)}});assert.ok(!/three/.test((await outsider.json()).reply));
 await p.reload();await expect(p.getByTestId('scene-canvas')).toHaveAttribute('data-ready','true');await p.getByRole('button',{name:'关闭档案',exact:true}).click();await interact();await expect(p.getByTestId('scene-composer')).toContainText('小满');assert.match((await send('我叫什么名字？')).reply,/three/);
 assert.equal(errors.length,0);await Promise.all(cookieChecks);assert.equal(cookieCreations,1);await writeFile(`${dir}/result.json`,JSON.stringify({id,externalCalls:0,cookieCreations,mode:'Fallback',timeline,paused,arrived,finalWorld:await get(),errors,checks:['real keyboard scene leave/return','same cookie durable name','proposal then confirmation','automatic real NPC route','midway pause/app restart/refresh','arrival distinct from meeting','player walks into cafe and E confirms presence','recalled sourced meeting','independent browser privacy']},null,2));
 const video=p.video();await a.close();a=null;await rename(await video.path(),`${dir}/journey.webm`);console.log(JSON.stringify({dir,passed:true,externalCalls:0}));
}catch(e){await p?.screenshot({path:`${dir}/failure.png`,fullPage:true});await writeFile(`${dir}/failure.json`,JSON.stringify({id,timeline,errors,error:String(e)},null,2));throw e;}finally{await a?.close();await b?.close();await browser?.close();await stop();log.end();await database().end();}
