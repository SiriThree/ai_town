import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
process.env.PLAYWRIGHT_BROWSERS_PATH=path.resolve('.browsers');
const {chromium,expect}=await import('@playwright/test');
const {database}=await import('../src/lib/store.ts');
const {createWorld,populateResidents,advanceWorld,assertWorld}=await import('../src/lib/world.ts');
const {canStand}=await import('../src/lib/scene-data.ts');
const {interactionTarget,busyReason}=await import('../src/lib/interaction.ts');
const u=new URL(process.env.DATABASE_URL);assert.equal(u.hostname,'127.0.0.1');assert.equal(u.port,'55488');assert.equal(u.pathname,'/ai_town_mvp_test');
const id=`life-interaction-${randomUUID()}`,dir=`evidence/v12-life/${id}`,base='http://127.0.0.1:3141';await mkdir(dir,{recursive:true});
let w=populateResidents(createWorld()),chosen,player;
for(let i=0;i<400&&!chosen;i++){
 w=advanceWorld(w);assertWorld(w);
 for(const e of w.lifeExpressions??[]){if(e.revision!==w.revision||w.conversations?.some(c=>c.sceneId===e.sceneId&&!c.timeline.completed))continue;const n=w.npcs.find(n=>n.id===e.npcId);if(busyReason(n,w))continue;for(const [dx,dy]of [[0,42],[42,0],[-42,0],[0,-42]]){const p={version:1,sceneId:n.sceneId,position:{x:n.position.x+dx,y:n.position.y+dy},facing:'north'};if(canStand(p.sceneId,p.position)&&interactionTarget(p,w.npcs)?.id===n.id){chosen=e;player=p;break;}}if(chosen)break;}
}
assert.ok(chosen);w.run={running:false,nextTickAt:null};await database().query('INSERT INTO town_worlds(id,revision,payload) VALUES($1,$2,$3)',[id,w.revision,JSON.stringify(w)]);
let server,browser;const delay=ms=>new Promise(r=>setTimeout(r,ms)),errors=[];
try{
 server=spawn(process.execPath,['node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port','3141'],{windowsHide:true,stdio:'ignore',env:{...process.env,WORLD_ID:id,PUBLIC_DEMO:'false',AI_ENABLED:'false',NPC_AI_ENABLED:'false',AI_API_KEY:''}});
 for(let i=0;i<300;i++){try{if((await fetch(base+'/api/world')).ok)break;}catch{}await delay(100);}
 browser=await chromium.launch({headless:true});const context=await browser.newContext({viewport:{width:1440,height:900}});await context.addInitScript(p=>sessionStorage.setItem('morning-town:player:v1',JSON.stringify(p)),player);
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));await page.goto(base);await expect(page.getByTestId('scene-canvas')).toHaveAttribute('data-ready','true');await expect(page.getByTestId('life-bubble')).toBeVisible();await page.screenshot({path:dir+'/before-chat.png',fullPage:true});
 const beforeZoom=await page.getByTestId('life-bubble').boundingBox();await page.getByRole('button',{name:'缩小地图',exact:true}).click();await expect.poll(async()=>(await page.getByTestId('life-bubble').boundingBox())?.y).not.toBe(beforeZoom.y);const beforePan=await page.getByTestId('life-bubble').boundingBox();await page.mouse.move(350,600);await page.mouse.down();await page.mouse.move(450,600,{steps:4});await page.mouse.up();await expect.poll(async()=>(await page.getByTestId('life-bubble').boundingBox())?.x).not.toBe(beforePan.x);await expect(page.getByTestId('life-bubble')).toHaveAttribute('data-npc',chosen.npcId);await page.screenshot({path:dir+'/camera-follow.png',fullPage:true});
 await page.getByTestId('scene-viewport').focus();await page.keyboard.press('e');await expect(page.getByTestId('scene-composer')).toBeVisible();const position=await page.getByTestId('player').getAttribute('data-x');
 await page.locator('textarea').fill('你好');const reply=page.waitForResponse(r=>r.url().endsWith(`/${chosen.npcId}/chat`)&&r.request().method()==='POST');await page.getByRole('button',{name:'发送消息',exact:true}).click();const response=await reply;assert.equal(response.status(),200);const turn=await response.json();assert.equal(turn.source,'fallback');await expect(page.getByTestId('speech-bubble')).toBeVisible();await expect(page.getByTestId('life-bubble')).toHaveCount(0);await expect(page.getByTestId('player')).toHaveAttribute('data-x',position);await page.screenshot({path:dir+'/player-priority.png',fullPage:true});
 await page.keyboard.press('Escape');await page.getByTestId(`npc-${chosen.npcId}`).click();await page.getByText('生活片刻',{exact:true}).click();await expect(page.getByTestId('profile')).toContainText(chosen.text);await page.screenshot({path:dir+'/life-details.png',fullPage:true});
 const other=await browser.newContext();const privateData=await(await other.request.get(base+`/api/npcs/${chosen.npcId}/chat`)).json();assert.deepEqual(privateData.turns,[]);await other.close();
 const final=await(await fetch(base+'/api/world')).json();assert.deepEqual(final,JSON.parse(JSON.stringify(w)));assert.equal(errors.length,0);
 await writeFile(dir+'/result.json',JSON.stringify({id,chosen,player,turn,errors,externalModelCalls:0,checks:['real simulated seed (no authored dialogue injection)','zoom and pan update bubble position and preserve speaker','E interaction','fallback chat overrides ambient bubble','input does not move avatar','thought/self-talk details available','second visitor cannot read private greeting','paused world unchanged by chat']},null,2));console.log(JSON.stringify({dir,passed:true}));
}finally{await browser?.close();if(server&&server.exitCode===null&&!server.signalCode)await new Promise(r=>{server.once('exit',r);server.kill();});await database().end();}
