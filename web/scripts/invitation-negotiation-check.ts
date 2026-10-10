import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdir,writeFile} from 'node:fs/promises';
import {database,initializeWorld,readWorld,updateWorld,tickWorld,wakeWorld} from '../src/lib/store';
import {chat,chatHistory} from '../src/lib/chat-service';
import {privateAppointments,privateConversationState,recordMeeting} from '../src/lib/invitation-store';
import {invitationIntent,cafeTravelMinutes} from '../src/lib/appointments';
import {assertWorld} from '../src/lib/world';
import {validScenePath} from '../src/lib/scene-data';
const url=new URL(process.env.DATABASE_URL!);assert.equal(url.hostname,'127.0.0.1');assert.equal(url.port,'55488');assert.equal(url.pathname,'/ai_town_mvp_test');
Object.assign(process.env,{AI_ENABLED:'false',NPC_AI_ENABLED:'false',AI_API_KEY:'',CHAT_REQUESTS_PER_MINUTE:'120'});
const id=`negotiation-${randomUUID()}`,dir=`evidence/invitation-regression/${id}`,visitor='a'.repeat(64),other='b'.repeat(64),ids:string[]=[],timeline:unknown[]=[];
async function seed(suffix='',minute=732){const world=id+suffix;ids.push(world);await initializeWorld(world);await updateWorld(world,w=>{w.minute=minute;w.run={running:false,nextTickAt:null};for(const n of w.npcs){n.energy=85;n.hunger=15;n.mood=85;}return {...w,revision:w.revision+1};});return world;}
async function send(message:string,world=id,npc='aqing',who=visitor,requestId=randomUUID()){
 const history=await chatHistory(npc,who,world),before=await privateAppointments(world,npc,who),turn=await chat(npc,message,who,world,requestId),after=await privateAppointments(world,npc,who);
 timeline.push({worldId:world,npc,visitor:who===visitor?'A':'B',message,intent:invitationIntent(message),history,before,after,turn,world:await readWorld(world)});assert.equal(turn.source,'fallback');return turn;
}
async function step(world=id){const w=await readWorld(world),next=await tickWorld(w.revision,world);assertWorld(next);for(const n of next.npcs)if(n.lastPath.length)assert.ok(validScenePath(n.sceneId,n.lastPath));return next;}
try{
 const polite=await seed('-polite',5*1440+732);
 await send('我现在可以邀请你一起去咖啡馆喝杯咖啡吗',polite);
 const draft=(await privateAppointments(polite,'aqing',visitor))[0];assert.equal(draft.status,'proposed');assert.equal(draft.target,'cafe');assert.equal(draft.scheduledMinute,undefined);assert.equal((await readWorld(polite)).npcs[0].appointment,undefined);
 const politeRequest=randomUUID(),politeConfirmation=await send('我们约下午一点怎么样',polite,'aqing',visitor,politeRequest);
 const politeAgreement=(await privateAppointments(polite,'aqing',visitor))[0];assert.equal(politeAgreement.id,draft.id);assert.equal(politeAgreement.status,'accepted');assert.equal(politeAgreement.scheduledMinute,5*1440+780);assert.match(politeConfirmation.reply,/第6天13:00咖啡馆/);
 assert.deepEqual(await chat('aqing','我们约下午一点怎么样',visitor,polite,politeRequest),politeConfirmation);
 assert.match((await send('你还记得我们的约定吗？',polite)).reply,/13:00咖啡馆/);assert.equal((await privateAppointments(polite,'aqing',visitor)).length,1);
 await send('我们约下午一点怎么样',polite,'aqing',other);assert.deepEqual(await privateAppointments(polite,'aqing',other),[]);
 let politeArrival=false;for(let i=0;i<100;i++){const w=await step(polite);if(w.npcs[0].appointment?.status==='arrived'){assert.equal(w.npcs[0].sceneId,'cafe_interior');politeArrival=true;break;}}assert.ok(politeArrival);
 await seed();await send('我们能一起去咖啡馆喝杯咖啡吗？');let a=(await privateAppointments(id,'aqing',visitor))[0];assert.equal(a.status,'proposed');assert.equal(a.scheduledMinute,undefined);assert.equal(a.target,'cafe');assert.equal((await readWorld(id)).npcs[0].appointment,undefined);const firstId=a.id;
 const confirmationId=randomUUID(),confirmed=await send('那我们约下午2点可以吗？',id,'aqing',visitor,confirmationId);
 a=(await privateAppointments(id,'aqing',visitor))[0];assert.equal(a.id,firstId);assert.equal(a.status,'accepted');assert.equal(a.scheduledMinute,840);assert.match(confirmed.reply,/14:00咖啡馆/);assert.equal((await readWorld(id)).npcs[0].appointment?.id,firstId);
 for(const message of ['下午2点在咖啡馆见面可以吗？','你还记得我们的约定吗？','下午2点咖啡馆可以吗','？','你什么时候过来呢？']){const t=await send(message);assert.match(t.reply,/14:00/);assert.ok(!t.reply.includes('广场'));}
 assert.deepEqual(await chat('aqing','那我们约下午2点可以吗？',visitor,id,confirmationId),confirmed);await assert.rejects(chat('aqing','那我们约下午3点可以吗？',visitor,id,confirmationId),/同一请求/);assert.equal((await privateAppointments(id,'aqing',visitor)).length,1);
 const b=await send('下午两点可以吗',id,'aqing',other);assert.ok(!/说好|约好/.test(b.reply));assert.deepEqual(await privateAppointments(id,'aqing',other),[]);
 const refused=await send('下午2点在咖啡馆见面可以吗',id,'aqing',other);assert.match(refused.reply,/已有|已经有/);assert.equal((await privateAppointments(id,'aqing',other))[0].status,'refused');assert.equal((await readWorld(id)).npcs[0].appointment?.id,firstId);
 const pause=await readWorld(id);assert.deepEqual(await wakeWorld(id),pause);
 let moving;for(let i=0;i<90;i++){const w=await step();if(w.npcs[0].appointment?.status==='travelling'&&w.npcs[0].ongoing?.path.length){moving=w;break;}}assert.ok(moving);
 assert.match((await send('你什么时候过来呢？')).reply,/赶往咖啡馆/);
 let arrival;for(let i=0;i<100;i++){const w=await step();if(w.npcs[0].appointment?.status==='arrived'){arrival=w;break;}}assert.ok(arrival);assert.equal(arrival.npcs[0].sceneId,'cafe_interior');assert.equal(arrival.npcs[0].appointment?.metMinute,undefined);
 assert.match((await send('你还记得我们的约定吗？')).reply,/等你/);
 const presence={sceneId:'cafe_interior',position:arrival.npcs[0].position};assert.equal((await recordMeeting(id,'aqing',other,presence)).meeting,null);assert.equal((await recordMeeting(id,'aqing',visitor,presence)).meeting?.status,'met');assert.match((await send('你还记得我们的约定吗？')).reply,/见面/);
 const client=await database().connect();try{const facts=(await privateConversationState(client,id,'aqing',visitor,'记得约定吗')).recall;assert.ok(facts.events.some(e=>e.kind==='invited'&&e.sourceId===firstId&&e.turnId===confirmed.id));assert.ok(facts.events.some(e=>e.kind==='met'));assert.ok(!(await privateConversationState(client,id,'aqing',other)).recall.events.some(e=>e.kind==='invited'||e.kind==='met'));}finally{client.release();}
 const tired=await seed('-tired');await updateWorld(tired,w=>{w.npcs[0].energy=10;return {...w,revision:w.revision+1};});assert.match((await send('下午2点在咖啡馆见面可以吗？',tired)).reply,/太累/);assert.equal((await readWorld(tired)).npcs[0].appointment,undefined);
 const work=await seed('-work');await updateWorld(work,w=>{w.npcs.find(n=>n.id==='laolin')!.workTask={id:'important',kind:'store',phase:'active',progress:0,createdMinute:w.minute};return {...w,revision:w.revision+1};});
 await send('下午12点34分在咖啡馆见面可以吗？',work,'laolin');const counter=(await privateAppointments(work,'laolin',visitor))[0];assert.equal(counter.status,'proposed');assert.ok(counter.scheduledMinute!>754);assert.equal((await readWorld(work)).npcs.find(n=>n.id==='laolin')!.appointment,undefined);assert.match((await send('好的',work,'laolin')).reply,/说好/);assert.equal((await readWorld(work)).npcs.find(n=>n.id==='laolin')!.workTask?.progress,0);
 const old=await seed('-past');await send('上午9点在咖啡馆见面可以吗',old);assert.equal((await readWorld(old)).npcs[0].appointment,undefined);
 const tomorrow=await seed('-tomorrow',1430);await send('我们能一起去咖啡馆喝杯咖啡吗？',tomorrow);await send('明天凌晨零点三十分可以吗？',tomorrow);assert.equal((await privateAppointments(tomorrow,'aqing',visitor))[0].scheduledMinute,1470);for(let i=0;i<8;i++)await step(tomorrow);assert.ok((await readWorld(tomorrow)).minute>=1440);assert.match((await send('你还记得我们的约定吗？',tomorrow)).reply,/第2天/);
 const cancelled=await seed('-cancel');await send('我们能一起去咖啡馆喝杯咖啡吗？',cancelled);await send('下午两点可以吗',cancelled);await send('取消约定',cancelled);assert.match((await send('你还记得我们的约定吗？',cancelled)).reply,/取消/);assert.equal((await readWorld(cancelled)).npcs[0].appointment?.status,'cancelled');
 const retry=await seed('-retry');await send('我们能一起去咖啡馆喝杯咖啡吗？',retry);await send('好的',retry);assert.equal((await privateAppointments(retry,'aqing',visitor))[0].scheduledMinute,undefined);assert.equal((await readWorld(retry)).npcs[0].appointment,undefined);
 const late=await seed('-late');await send('下午1点在咖啡馆见面可以吗',late);for(let i=0;i<100;i++){const w=await step(late);if(w.npcs[0].appointment?.status==='missed')break;}assert.equal((await readWorld(late)).npcs[0].appointment?.status,'missed');
 const mid=await seed('-restart');const eta=cafeTravelMinutes((await readWorld(mid)).npcs[0],await readWorld(mid))!;await send('那我们现在就去咖啡馆可以吗？',mid);let movingWorld;for(let i=0;i<20;i++){const w=await step(mid);if(w.npcs[0].ongoing?.path.length){movingWorld=w;break;}}assert.ok(movingWorld);assert.ok(eta>0);
 await mkdir(dir,{recursive:true});await writeFile(`${dir}/result.json`,JSON.stringify({id,ids,externalCalls:0,timeline,firstId,confirmed,moving,arrival,restartWorld:mid,checks:['full reported dialogue','identity and history scoped','pending target without invented time','Chinese and numeric explicit time','one agreement and durable retry receipts','authority-based status/clarification','different visitor isolation','work counteroffer and consent','refusal without executable task','real paths and arrival distinct from meeting','paused world','cross-day clock','cancel and missed','source-linked memory']},null,2));console.log(JSON.stringify({dir,passed:true,worlds:ids.length}));
}finally{await database().end();}
