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
const u=new URL(process.env.DATABASE_URL);assert.equal(u.hostname,'127.0.0.1');assert.equal(u.port,'55488');assert.equal(u.pathname,'/ai_town_mvp_test');
const id=`life-browser-${randomUUID()}`,dir=`evidence/v12-life/${id}`,base='http://127.0.0.1:3140';await mkdir(dir,{recursive:true});
const log=createWriteStream(dir+'/server.log'),delay=ms=>new Promise(r=>setTimeout(r,ms));let server,browser;const contexts=[],pages=[],errors=[],network=[],rendered=new Map(),expressions=new Map(),conversations=new Map(),timeline=[],shots=new Set();
async function start(){server=spawn(process.execPath,['node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port','3140'],{windowsHide:true,stdio:['ignore','pipe','pipe'],env:{...process.env,WORLD_ID:id,PUBLIC_DEMO:'false',AI_ENABLED:'false',NPC_AI_ENABLED:'false',AI_API_KEY:'',AI_TEST_MODE:'true'}});server.stdout.pipe(log,{end:false});server.stderr.pipe(log,{end:false});for(let i=0;i<300;i++){if(server.exitCode!==null)throw Error('server exited');try{if((await fetch(base+'/api/world')).ok)return;}catch{}await delay(100);}throw Error('startup failed');}
async function stop(){if(server&&server.exitCode===null&&!server.signalCode)await new Promise(r=>{server.once('exit',r);server.kill();});}
const get=async()=>await(await fetch(base+'/api/world')).json();
try{
 const seed=populateResidents(createWorld());seed.run={running:false,nextTickAt:null};await database().query('INSERT INTO town_worlds(id,revision,payload) VALUES($1,$2,$3)',[id,seed.revision,JSON.stringify(seed)]);
 await start();browser=await chromium.launch({headless:true});
 for(const [name,scene,position]of [['town','town',{x:480,y:368}],['cafe','cafe_interior',{x:480,y:450}]]){
  const context=await browser.newContext({viewport:{width:1440,height:900},recordVideo:{dir,size:{width:1440,height:900}}});contexts.push(context);
  await context.route('**/*',route=>route.request().url().startsWith(base)||route.request().url().startsWith('data:')?route.continue():route.abort());
  await context.addInitScript(({scene,position})=>{sessionStorage.setItem('morning-town:player:v1',JSON.stringify({version:1,sceneId:scene,position,facing:'north'}));},{scene,position});
  const page=await context.newPage();pages.push({page,name});page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(r.url().includes('/api/'))network.push({url:r.url(),method:r.method(),at:Date.now()});});await page.goto(base);await expect(page.getByTestId('scene-canvas')).toHaveAttribute('data-ready','true');
 }
 await pages[0].page.getByRole('button',{name:'开始自动运行',exact:true}).click();
 const started=Date.now();console.log(JSON.stringify({dir,id,observationStarted:new Date(started).toISOString(),seconds:600}));
 let lastRead=0;
 while(Date.now()-started<600000){
  if(Date.now()-lastRead>1000){const w=await get();lastRead=Date.now();for(const e of w.lifeExpressions??[])expressions.set(e.id,e);for(const c of w.conversations??[])conversations.set(c.id,c);timeline.push({at:Date.now()-started,minute:w.minute,revision:w.revision,npcs:w.npcs.map(n=>({id:n.id,sceneId:n.sceneId,position:n.position,action:n.action,ongoing:n.ongoing?.id,elapsed:n.ongoing?.elapsedMs})),workOutputs:w.workOutputs});}
  for(const {page,name}of pages){
   const visible=await page.locator('[data-testid="life-bubble"],[data-testid^="public-bubble-"]').evaluateAll(nodes=>nodes.map(n=>({id:n.dataset.expression??`${n.dataset.conversation}:${n.dataset.turn}`,kind:n.dataset.kind??'conversation',npc:n.dataset.npc,text:n.querySelector('p')?.textContent,rect:{x:n.getBoundingClientRect().x,y:n.getBoundingClientRect().y,width:n.getBoundingClientRect().width,height:n.getBoundingClientRect().height},viewport:{width:innerWidth,height:innerHeight}})));
   assert.ok(visible.length<=1);
   for(const e of visible){if(!rendered.has(e.id))rendered.set(e.id,{...e,view:name,at:Date.now()-started});const source=expressions.get(e.id);const label=source?.topic==='working'?'work-self-talk':e.kind;if(!shots.has(label)){await page.screenshot({path:`${dir}/${name}-${label}.png`,fullPage:true});shots.add(label);}}
  }
  await delay(200);
 }
 const elapsed=Date.now()-started;await pages[0].page.getByRole('button',{name:'暂停自动运行',exact:true}).click();await expect.poll(async()=>(await get()).run.running).toBe(false);const paused=await get();await delay(2200);assert.deepEqual(await get(),paused);
 await stop();await start();assert.deepEqual(await get(),paused);await pages[0].page.reload();await expect(pages[0].page.getByTestId('scene-canvas')).toHaveAttribute('data-ready','true');await pages[0].page.screenshot({path:dir+'/paused-restored.png',fullPage:true});
 const all=[...expressions.values()],dialogues=[...conversations.values()],shown=[...rendered.values()];const counts={selfTalk:all.filter(e=>e.kind==='speech').length,thoughts:all.filter(e=>e.kind==='thought').length,conversations:dialogues.length,shownSelfTalk:shown.filter(e=>e.kind==='speech').length,shownThoughts:shown.filter(e=>e.kind==='thought').length,shownConversationTurns:shown.filter(e=>e.kind==='conversation').length};
 assert.ok(counts.shownSelfTalk&&counts.shownThoughts&&counts.shownConversationTurns);assert.ok(shots.has('work-self-talk'));assert.equal(errors.length,0);
 const result={id,dir,elapsedMs:elapsed,counts,externalModelCalls:0,seed:'unchanged populateResidents(createWorld()); two local observer avatars in town/cafe, no NPC/dialogue injection',expressions:all,conversations:dialogues,shown,countsByText:Object.fromEntries([...new Set(all.map(e=>e.text))].map(t=>[t,all.filter(e=>e.text===t).length])),lengths:all.map(e=>Array.from(e.text).length),timeline,errors,network,paused,checks:['ten real minutes','one ambient bubble per viewport','ordinary auto run from genuine seed','two observers no duplicate speed','paused exact state','server restart exact snapshot','reload render']};
 await writeFile(dir+'/result.json',JSON.stringify(result,null,2));
 for(let i=0;i<contexts.length;i++){const video=pages[i].page.video();await contexts[i].close();await rename(await video.path(),`${dir}/${pages[i].name}-10minutes.webm`);}contexts.length=0;console.log(JSON.stringify({dir,elapsed,counts,passed:true}));
}catch(e){await writeFile(dir+'/failure.json',JSON.stringify({error:String(e),errors,timeline,shown:[...rendered.values()],expressions:[...expressions.values()]},null,2));throw e;}finally{for(const c of contexts)await c.close();await browser?.close();await stop();log.end();await database().end();}
