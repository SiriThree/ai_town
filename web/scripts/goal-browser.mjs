import assert from 'node:assert/strict';
import {createServer} from 'node:http';
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
const id=`goal-browser-${randomUUID()}`,dir=`evidence/v11-7/${id}`,base='http://127.0.0.1:3139';
const polite=process.argv.includes('--polite'),startMinute=polite?5*1440+732:732,meetingMinute=polite?5*1440+780:840,clock=polite?/13:00/:/14:00/;
await mkdir(dir,{recursive:true});const log=createWriteStream(`${dir}/server.log`);let server,browser,a,b,p;const errors=[],timeline=[];
const delay=ms=>new Promise(r=>setTimeout(r,ms));
const modelCalls=[];
const model=createServer(async(req,res)=>{let raw='';for await(const chunk of req)raw+=chunk;const b=JSON.parse(raw);modelCalls.push(b);
 const facts=JSON.parse(b.messages.find(m=>m.content.includes('世界事实：\n')).content.split('世界事实：\n')[1]);const message=b.messages.findLast(m=>m.role==='user').content;
 let content;
 if(b.response_format){const ref=facts.privateAppointments[0]?.id??null;let operation='status',time=null,timing='unspecified',destination=null;
  if(message==='今天有空一起喝点东西吗？'){operation='propose';destination='cafe';}
  else if(message==='午后一点如何？'){operation='update';time={day:6,hour:13,minute:0};timing='scheduled';}
  content=JSON.stringify({kind:'goal',intent:{goal:'meet',operation,destination,time,timing,confidence:.95,referenceId:operation==='propose'?null:ref}});
 }else{const outcome=JSON.parse(b.messages.at(-1).content.split('权威结果：')[1]);content=outcome.explanation;}
 res.setHeader('Content-Type','application/json');res.end(JSON.stringify({choices:[{message:{content}}]}));});
await new Promise(r=>model.listen(0,'127.0.0.1',r));const modelUrl=`http://127.0.0.1:${model.address().port}/v1`;

async function start(){server=spawn(process.execPath,['node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port','3139'],{windowsHide:true,stdio:['ignore','pipe','pipe'],env:{...process.env,WORLD_ID:id,PUBLIC_DEMO:'false',AI_ENABLED:'true',NPC_AI_ENABLED:'true',AI_API_KEY:'local-only',AI_BASE_URL:modelUrl,AI_MODEL:'mock',AI_TEST_MODE:'true',CHAT_REQUESTS_PER_MINUTE:'120'}});server.stdout.pipe(log,{end:false});server.stderr.pipe(log,{end:false});for(let i=0;i<300;i++){if(server.exitCode!==null)throw Error("server exited "+server.exitCode);try{if((await fetch(base+'/api/world')).ok)return;}catch{}await delay(100);}throw Error('server startup');}
async function stop(){if(server&&server.exitCode===null&&!server.signalCode)await new Promise(r=>{server.once('exit',r);server.kill();});}
const get=async()=>await(await fetch(base+'/api/world')).json();
const current=async()=>(await get()).npcs.find(n=>n.id==='aqing');
async function shot(name){await p.screenshot({path:`${dir}/${name}.png`,fullPage:true});}
async function send(message){await p.locator('textarea').fill(message);const response=p.waitForResponse(r=>r.url().endsWith('/aqing/chat')&&r.request().method()==='POST'&&r.request().postDataJSON().message===message);await p.getByRole('button',{name:'发送消息',exact:true}).click();const r=await response;assert.equal(r.status(),200);const turn=await r.json();await expect(p.locator('textarea')).toHaveValue('');timeline.push({message,turn,worldMinute:(await get()).minute,npc:await current()});return turn;}
async function interact(){await p.getByTestId('scene-viewport').focus();await p.keyboard.press('e');}
async function closeChat(){await p.keyboard.press('Escape');await expect(p.getByTestId('scene-composer')).toHaveCount(0);}
async function move(axis,target){
 await p.getByTestId('scene-viewport').focus();const value=()=>p.getByTestId('player').getAttribute(`data-${axis}`).then(Number);let current=await value();
 if(Math.abs(target-current)>10){const positive=target>current,key=axis==='x'?(positive?'d':'a'):(positive?'s':'w');await p.keyboard.down(key);try{await p.waitForFunction(({axis,target,positive})=>{const v=Number(document.querySelector('[data-testid="player"]').dataset[axis]);return positive?v>=target-8:v<=target+8;},{axis,target,positive},{timeout:20000});}finally{await p.keyboard.up(key);}}
 for(let i=0;i<35;i++){current=await value();if(Math.abs(target-current)<=1.8)return;const key=axis==='x'?(target>current?'d':'a'):(target>current?'s':'w');await p.keyboard.down(key);await delay(8);await p.keyboard.up(key);await delay(16);}throw Error(`alignment ${axis} ${target} ${await value()}`);
}
async function walk(to){const el=p.getByTestId('player'),scene=await el.getAttribute('data-scene'),from={x:Number(await el.getAttribute('data-x')),y:Number(await el.getAttribute('data-y'))};const route=findScenePath(scene,from,to);assert.ok(route.length);for(const point of route.slice(1)){await move('x',point.x);await move('y',point.y);}}
try{
 const seed=populateResidents(createWorld());seed.minute=startMinute;for(const n of seed.npcs)Object.assign(n,{hunger:15,energy:85,mood:85});seed.run={running:false,nextTickAt:null};
 await database().query('INSERT INTO town_worlds(id,revision,payload) VALUES($1,$2,$3)',[id,seed.revision,JSON.stringify(seed)]);
 await start();browser=await chromium.launch({headless:true});a=await browser.newContext({viewport:{width:1440,height:900},recordVideo:{dir,size:{width:1440,height:900}}});
 await a.addInitScript(()=>{if(!sessionStorage.getItem('morning-town:player:v1'))sessionStorage.setItem('morning-town:player:v1',JSON.stringify({version:1,sceneId:'town',position:{x:480,y:368},facing:'west'}));});
 p=await a.newPage();p.on('pageerror',e=>errors.push(e.message));await p.goto(base);await expect(p.getByTestId('scene-canvas')).toHaveAttribute('data-ready','true');
 await interact();await expect(p.getByTestId('scene-composer')).toContainText('阿晴');
 await send('今天有空一起喝点东西吗？');assert.equal((await current()).appointment,undefined);await shot('01-cafe-negotiation');
 await send('午后一点如何？');const agreement=(await current()).appointment;assert.equal(agreement.scheduledMinute,meetingMinute);assert.equal(agreement.status,'accepted');await shot('02-confirmed-cafe-time');
 for(const message of [polite?'下午1点在咖啡馆见面可以吗？':'下午2点在咖啡馆见面可以吗？','你还记得我们的约定吗？','？'])assert.match((await send(message)).reply,clock);
 await shot('03-authoritative-recall');await closeChat();
 await p.getByRole('button',{name:'开始自动运行',exact:true}).click();await walk({x:762,y:324});
 await expect.poll(async()=>(await current()).appointment.status,{timeout:90000,intervals:[250]}).toBe('travelling');await shot('04-real-route');
 await p.getByRole('button',{name:'暂停自动运行',exact:true}).click();await expect.poll(async()=>(await get()).run.running).toBe(false);const paused=await get();
 await stop();await start();assert.deepEqual(await get(),paused);await p.reload();await expect(p.getByTestId('scene-canvas')).toHaveAttribute('data-ready','true');await p.keyboard.press('Escape');assert.equal((await current()).appointment.id,agreement.id);await shot('05-restart-preserved');
 await p.getByRole('button',{name:'开始自动运行',exact:true}).click();await expect.poll(async()=>(await current()).appointment.status,{timeout:45000,intervals:[250]}).toBe('arrived');
 await p.getByRole('button',{name:'暂停自动运行',exact:true}).click();await expect.poll(async()=>(await get()).run.running).toBe(false);const arrived=await current();assert.equal(arrived.appointment.metMinute,undefined);
 await interact();await expect(p.getByTestId('scene-canvas')).toHaveAttribute('data-scene','cafe_interior');await walk({x:arrived.position.x,y:450});await interact();await expect(p.getByTestId('scene-composer')).toContainText('阿晴');
 await expect.poll(async()=>(await current()).appointment.status,{timeout:10000}).toBe('met');assert.match((await send('你还记得我们的约定吗？')).reply,/见(?:过)?面/);await shot('06-real-meeting');
 await p.getByRole('button',{name:'查看历史',exact:true}).click();await shot('07-persisted-history');
 b=await browser.newContext();const privateResponse=await(await b.request.get(base+'/api/npcs/aqing/chat')).json();assert.deepEqual(privateResponse.turns,[]);assert.deepEqual(privateResponse.appointments,[]);
 assert.equal(errors.length,0);await writeFile(dir+'/result.json',JSON.stringify({id,externalCalls:0,mode:'local structured model fixture (not Qwen)',modelCalls,polite,timeline,agreement,paused,arrived,finalWorld:await get(),errors,checks:['reported multi-turn dialogue via real browser UI','cafe target inherited','explicit world time accepted before reply','actual automatic path','paused app restart and refresh','player walks through cafe door and E records meeting','second visitor private isolation']},null,2));
 const video=p.video();await a.close();a=null;await rename(await video.path(),dir+'/journey.webm');console.log(JSON.stringify({dir,passed:true,externalCalls:0}));
}catch(e){await p?.screenshot({path:dir+'/failure.png',fullPage:true});await writeFile(dir+'/failure.json',JSON.stringify({id,timeline,errors,error:String(e)},null,2));throw e;}finally{await a?.close();await b?.close();await browser?.close();await stop();log.end();await database().end();model.closeAllConnections();await new Promise(r=>model.close(r));}
