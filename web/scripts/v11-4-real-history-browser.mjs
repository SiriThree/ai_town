// Displays the actual saved real-provider turns. No model calls or message POSTs.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createHmac} from 'node:crypto';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {createWriteStream} from 'node:fs';
import path from 'node:path';
process.env.PLAYWRIGHT_BROWSERS_PATH=path.resolve('.browsers');
const {chromium,expect}=await import('@playwright/test');
const {canStand}=await import('../src/lib/scene-data.ts');
const {database}=await import('../src/lib/store.ts');
const u=new URL(process.env.DATABASE_URL);assert.equal(u.hostname,'127.0.0.1');assert.equal(u.port,'55488');assert.equal(u.pathname,'/ai_town_mvp_test');
const source=JSON.parse(await readFile(process.env.STORY_RESULT,'utf8'));assert.equal(source.real,true);assert.equal(source.externalCalls,8);
const dir='evidence/v11-4/real-history-browser',base='http://127.0.0.1:3127',secret='isolated-v114-browser-signing-secret-only';
await mkdir(dir,{recursive:true});const log=createWriteStream(`${dir}/server.log`);let server,browser,context;const errors=[];
try{
 server=spawn(process.execPath,['node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port','3127'],{windowsHide:true,stdio:['ignore','pipe','pipe'],env:{...process.env,WORLD_ID:source.id,PUBLIC_DEMO:'false',COOKIE_SIGNING_SECRET:secret,AI_ENABLED:'false',AI_API_KEY:'',NPC_AI_ENABLED:'false'}});
 server.stdout.pipe(log,{end:false});server.stderr.pipe(log,{end:false});let world;
 for(let i=0;i<100;i++){try{const r=await fetch(base+'/api/world');if(r.ok){world=await r.json();break;}}catch{}await new Promise(r=>setTimeout(r,100));}assert.ok(world);
 const npc=world.npcs.find(n=>n.id==='aning'),position={x:npc.position.x-36,y:npc.position.y};assert.ok(canStand(npc.sceneId,position));
 const before=(await database().query('SELECT turns,player_memory FROM town_private_chats WHERE world_id=$1 AND npc_id=$2 AND visitor_id=$3',[source.id,npc.id,'a'.repeat(64)])).rows[0];
 assert.equal(before.turns.at(-1).source,'ai');assert.equal(before.turns.at(-1).reply,source.modelCalls[6].generatedReply);
 browser=await chromium.launch({headless:true});context=await browser.newContext({viewport:{width:1440,height:900},recordVideo:{dir,size:{width:1440,height:900}}});
 const payload=`${'a'.repeat(64)}.${Math.floor(Date.now()/1000)+3600}`,signature=createHmac('sha256',secret).update(payload).digest('base64url');
 await context.addCookies([{name:'town_session',value:`${payload}.${signature}`,url:base,httpOnly:true,sameSite:'Strict'}]);
 await context.addInitScript(({scene,position})=>sessionStorage.setItem('morning-town:player:v1',JSON.stringify({version:1,sceneId:scene,position,facing:'east'})),{scene:npc.sceneId,position});
 const p=await context.newPage();p.on('pageerror',e=>errors.push(e.message));let chatPosts=0;p.on('request',r=>{if(r.url().endsWith('/chat')&&r.method()==='POST')chatPosts++;});
 await p.goto(base+'/?npc=aning');await expect(p.getByTestId('scene-canvas')).toHaveAttribute('data-ready','true');
 await p.getByRole('button',{name:'靠近后与阿宁对话',exact:true}).click();await expect(p.getByTestId('speech-bubble')).toContainText(source.modelCalls[6].generatedReply);
 await p.screenshot({path:`${dir}/01-real-saved-reply.png`,fullPage:true});
 await p.getByRole('button',{name:'查看历史',exact:true}).click();await expect(p.getByTestId('chat-turn')).toHaveCount(20);await p.screenshot({path:`${dir}/02-real-history.png`,fullPage:true});
 await p.getByRole('button',{name:'关闭历史',exact:true}).click();await p.getByRole('button',{name:'帮助',exact:true}).click();await p.getByRole('checkbox',{name:'开发诊断',exact:true}).check();await p.getByRole('button',{name:'关闭帮助',exact:true}).click();
 await expect(p.getByTestId('reply-source')).toContainText('AI 回复');await p.screenshot({path:`${dir}/03-real-source.png`,fullPage:true});
 assert.equal(chatPosts,0);assert.equal(errors.length,0);assert.deepEqual(await(await fetch(base+'/api/world')).json(),world);
 const outsider=await browser.newContext();const other=await(await outsider.request.get(base+'/api/npcs/aning/chat')).json();assert.deepEqual(other.turns,[]);assert.deepEqual(other.appointments,[]);await outsider.close();
 await writeFile(`${dir}/result.json`,JSON.stringify({world:source.id,actualReply:before.turns.at(-1),savedSource:'ai',newModelCalls:0,chatPosts,errors,otherVisitorEmpty:true,worldUnchanged:true,playerPlacement:'explicit test fixture near actual NPC; no walking claim'},null,2));
 const video=p.video();await context.close();context=null;await video.saveAs(`${dir}/history.webm`);console.log('Saved real-provider reply displayed via production HTTP/UI; 0 new calls');
}finally{await context?.close();await browser?.close();if(server?.exitCode===null)await new Promise(r=>{server.once('exit',r);server.kill();});log.end();await database().end();}
