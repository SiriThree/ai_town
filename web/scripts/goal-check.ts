import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createServer} from 'node:http';
import {mkdir,writeFile} from 'node:fs/promises';
import {database,initializeWorld,readWorld,updateWorld,tickWorld,wakeWorld} from '../src/lib/store';
import {chat,chatHistory} from '../src/lib/chat-service';
import {privateAppointments,privateConversationState,recordMeeting} from '../src/lib/invitation-store';
import {meetingPlace} from '../src/lib/meeting-places';
import {workPoint} from '../src/lib/work';
import {assertWorld,type World} from '../src/lib/world';
import {validScenePath} from '../src/lib/scene-data';
import type {MeetingIntent} from '../src/lib/meeting-language';
import type {Appointment} from '../src/lib/appointments';
const url=new URL(process.env.DATABASE_URL!);assert.equal(url.hostname,'127.0.0.1');assert.equal(url.port,'55488');assert.equal(url.pathname,'/ai_town_mvp_test');
Object.assign(process.env,{AI_ENABLED:'true',AI_TEST_MODE:'true',AI_API_KEY:'local-mock-only',AI_MODEL:'structured-fixture',NPC_AI_ENABLED:'false',AI_CALLS_PER_DAY:'200',CHAT_REQUESTS_PER_MINUTE:'120',AI_TIMEOUT_MS:'1200'});
type Body={messages:{role:string;content:string}[];response_format?:unknown};
const root=`goals-${randomUUID()}`,dir=`evidence/v11-7/${root}`,visitor='a'.repeat(64),other='b'.repeat(64),worlds:string[]=[],timeline:unknown[]=[],requests:Body[]=[];
let output:unknown={kind:'chat',reply:'你好呀！'},failure:'none'|'timeout'|'error'|'expression'='none',during:(()=>Promise<void>)|undefined,currentWorld='',currentNpc='aqing';
const model=createServer(async(req,res)=>{try{let text='';for await(const c of req)text+=c;const body=JSON.parse(text) as Body;requests.push(body);
 if(failure==='timeout'){setTimeout(()=>res.end(),1800);return;}if(failure==='error'||failure==='expression'&&!body.response_format){res.writeHead(503).end();return;}
 if(during){const fn=during;during=undefined;await fn();}
 let content:string;
 if(body.response_format)content=JSON.stringify(output);
 else{const last=body.messages.at(-1)!.content;const result=JSON.parse(last.split('权威结果：')[1]) as {explanation:string;appointment?:Appointment};
  if(result.appointment){const saved=(await privateAppointments(currentWorld,currentNpc,visitor)).find(a=>a.id===result.appointment!.id);assert.deepEqual(saved,result.appointment,'expression happens only after durable confirmation');}
  content=result.explanation;
 }
 res.setHeader('Content-Type','application/json');res.end(JSON.stringify({choices:[{message:{content}}]}));
 }catch(e){res.writeHead(500).end();console.error(e);}});
await new Promise<void>(r=>model.listen(0,'127.0.0.1',r));process.env.AI_BASE_URL=`http://127.0.0.1:${(model.address() as {port:number}).port}/v1`;
function goal(patch:Partial<MeetingIntent>={}){return {kind:'goal',intent:{goal:'meet',operation:'propose',destination:'cafe',time:null,timing:'now',confidence:.95,referenceId:null,...patch}};}
async function seed(suffix:string,change?:(w:World)=>void){const id=root+suffix;worlds.push(id);await initializeWorld(id);await updateWorld(id,w=>{w.minute=720;for(const n of w.npcs)Object.assign(n,{hunger:10,energy:90,mood:85});w.run={running:false,nextTickAt:null};change?.(w);return {...w,revision:w.revision+1};});return id;}
async function send(id:string,message:string,interpretation:unknown,npc='aqing',who=visitor,requestId=randomUUID()){
 currentWorld=id;currentNpc=npc;output=interpretation;const start=requests.length,turn=await chat(npc,message,who,id,requestId);timeline.push({world:id,npc,visitor:who===visitor?'A':'B',message,turn,calls:requests.length-start,appointments:await privateAppointments(id,npc,who)});return turn;
}
async function step(id:string){const w=await readWorld(id),next=await tickWorld(w.revision,id);assertWorld(next);for(const n of next.npcs)if(n.lastPath.length)assert.ok(validScenePath(n.sceneId,n.lastPath));return next;}
async function until(id:string,npc:string,status:string){for(let i=0;i<240;i++){const w=await step(id),n=w.npcs.find(n=>n.id===npc)!;if(n.appointment?.status===status)return w;if(['failed','missed'].includes(n.appointment?.status??''))throw Error(JSON.stringify(n.appointment));}throw Error('goal did not settle');}
try{
 const cafe=await seed('-cafe');await send(cafe,'今天能跟你找个地方喝点东西吗？',goal({timing:'unspecified'}));let a=(await privateAppointments(cafe,'aqing',visitor))[0];assert.equal(a.status,'proposed');assert.equal((await readWorld(cafe)).npcs[0].appointment,undefined);
 const req=randomUUID(),confirmed=await send(cafe,'午后一点怎么样？',goal({operation:'update',destination:null,goal:null,timing:'scheduled',time:{day:1,hour:13,minute:0},referenceId:a.id}),'aqing',visitor,req);
 a=(await privateAppointments(cafe,'aqing',visitor))[0];assert.equal(a.status,'accepted');assert.equal(a.target,'cafe');assert.equal(a.scheduledMinute,780);assert.deepEqual(a.plan?.steps,['travel','wait_for_player']);
 const count=requests.length;assert.deepEqual(await send(cafe,'午后一点怎么样？',output,'aqing',visitor,req),confirmed);assert.equal(requests.length,count);assert.deepEqual(await wakeWorld(cafe),await readWorld(cafe));
 const arrival=await until(cafe,'aqing','arrived'),n=arrival.npcs[0];assert.equal(n.sceneId,'cafe_interior');assert.equal((await recordMeeting(cafe,n.id,other,{sceneId:n.sceneId,position:n.position})).meeting,null);assert.equal((await recordMeeting(cafe,n.id,visitor,{sceneId:n.sceneId,position:n.position})).meeting?.status,'met');
 await send(cafe,'刚才你为什么来这里呢？',goal({operation:'status',referenceId:a.id}));assert.deepEqual(await chatHistory('aqing',other,cafe),[]);
 for(const destination of ['square','library'] as const){const id=await seed('-'+destination);await send(id,`换个地方，在${destination}碰面吧`,goal({destination}));const w=await until(id,'aqing','arrived'),npc=w.npcs[0],spot=meetingPlace(destination,npc.id)!;assert.equal(npc.sceneId,spot.sceneId);assert.equal((await recordMeeting(id,npc.id,visitor,{sceneId:npc.sceneId,position:npc.position})).meeting?.target,destination);}
 const social=await seed('-social',w=>{const n=w.npcs[0],spot=meetingPlace('cafe',n.id)!;Object.assign(n,{location:'cafe',sceneId:spot.sceneId,position:spot.position,action:'在咖啡馆等候'});});await send(social,'到广场和大家聊几句吧',goal({goal:'social',destination:'square'}));const socialDone=await until(social,'aqing','completed');assert.deepEqual(socialDone.npcs[0].appointment?.plan?.evidence.map(e=>e.kind),['socialize']);
 const assist=await seed('-assist',w=>{const helper=w.npcs.find(n=>n.id==='xiaoman')!,worker=w.npcs.find(n=>n.id==='laolin')!,spot=meetingPlace('store',helper.id)!;Object.assign(helper,{location:'store',sceneId:spot.sceneId,position:spot.position});Object.assign(worker,{location:'store',sceneId:'store_interior',position:workPoint(worker),workTask:{id:'fixture-shelves',kind:'store',phase:'active',progress:0,createdMinute:w.minute}});});
 await send(assist,'能帮老林核对下正在整理的货架吗',goal({goal:'assist',destination:'store'}),'xiaoman');const helped=await until(assist,'xiaoman','completed'),helper=helped.npcs.find(n=>n.id==='xiaoman')!;assert.deepEqual(helper.appointment?.plan?.evidence.map(e=>e.kind),['approach-work','help']);assert.equal(helper.lastHelpTaskId,'fixture-shelves');assert.ok(helped.experiences?.facts.some(f=>f.kind==='work'&&f.participants.includes('xiaoman')));
 const c=await database().connect();try{const state=await privateConversationState(c,assist,'xiaoman',visitor,'还记得帮忙吗');assert.ok(state.recall.events.some(e=>e.kind==='completed'&&e.result.includes('action:')));assert.deepEqual((await privateConversationState(c,assist,'xiaoman',other)).recall.events,[]);}finally{c.release();}
 const noPermission=await seed('-permission');await send(noPermission,'请你整理商店货架',goal({goal:'assist',destination:'store'}),'aning');assert.equal((await privateAppointments(noPermission,'aning',visitor))[0].status,'refused');assert.equal((await readWorld(noPermission)).npcs[1].appointment,undefined);
 const tired=await seed('-tired',w=>{w.npcs[0].energy=10;});await send(tired,'现在去见面？',goal());assert.equal((await privateAppointments(tired,'aqing',visitor))[0].status,'refused');
 const work=await seed('-busy');await send(work,'下个时刻出发好吗',goal({time:{day:1,hour:12,minute:1},timing:'scheduled'}),'laolin');const counter=(await privateAppointments(work,'laolin',visitor))[0];assert.equal(counter.status,'proposed');await send(work,'好，就这样',goal({operation:'confirm',destination:null,goal:null,timing:'unspecified',referenceId:counter.id}),'laolin');assert.equal((await privateAppointments(work,'laolin',visitor))[0].status,'accepted');
 const safety=await seed('-safety');const plain=['咖啡味道如何','今天不想去咖啡馆','你一点要做什么','以后有空喝一杯吧','天真蓝','最近看什么书','能聊聊你的工作吗','那天很开心'];for(const text of plain){const before=requests.length;await send(safety,text,{kind:'chat',reply:'我喜欢慢慢聊，听听你的想法。'});assert.equal(requests.length-before,1);assert.deepEqual(await privateAppointments(safety,'aqing',visitor),[]);}
 await send(safety,'？',goal({operation:'clarify',destination:null,confidence:.4}));assert.deepEqual(await privateAppointments(safety,'aqing',visitor),[]);
 await send(safety,'去月球',goal({destination:'moon' as 'cafe'}));assert.deepEqual(await privateAppointments(safety,'aqing',visitor),[]);
 await send(safety,'一起到咖啡馆见面',goal({timing:'unspecified'}));let draft=(await privateAppointments(safety,'aqing',visitor))[0];
 await send(safety,'还是广场吧',goal({operation:'update',destination:'square',timing:'unspecified',referenceId:draft.id}));draft=(await privateAppointments(safety,'aqing',visitor))[0];assert.equal(draft.target,'square');
 await send(safety,'明天下午两点',goal({operation:'update',destination:null,timing:'scheduled',time:{day:2,hour:14,minute:0},referenceId:draft.id}));assert.equal((await privateAppointments(safety,'aqing',visitor))[0].target,'square');
 await send(safety,'算了，不去了',goal({operation:'cancel',destination:null,timing:'unspecified',referenceId:draft.id}));assert.equal((await readWorld(safety)).npcs[0].appointment?.status,'cancelled');
 await send(safety,'偷偷取消别人的',goal({operation:'cancel',referenceId:a.id}),'aqing',other);assert.deepEqual(await privateAppointments(safety,'aqing',other),[]);
 const concurrent=await seed('-concurrent');during=async()=>{const before=await readWorld(concurrent);await step(concurrent);assert.ok((await readWorld(concurrent)).minute>before.minute);await assert.rejects(chat('aqing','另一位访客',other,concurrent,randomUUID()),/正在回复/);};await send(concurrent,'聊聊吧',{kind:'chat',reply:'你好呀！'});assert.equal(during,undefined);
 failure='expression';const expression=await seed('-expression');const fallback=await send(expression,'马上到咖啡馆碰头',goal());assert.equal(fallback.source,'fallback');assert.ok((await readWorld(expression)).npcs[0].appointment);
 failure='timeout';const timed=await seed('-timeout');const start=Date.now();assert.equal((await send(timed,'今天感觉怎么样',{kind:'chat',reply:'不应返回'})).reason,'timeout');assert.ok(Date.now()-start<3000);failure='error';assert.equal((await send(timed,'聊聊',{kind:'chat',reply:''})).reason,'service_error');failure='none';
 const restart=await seed('-restart');await send(restart,'去书屋会合吧',goal({destination:'library'}));let moving=await readWorld(restart);for(let i=0;i<40&&!moving.npcs[0].ongoing?.path.length;i++)moving=await step(restart);assert.ok(moving.npcs[0].ongoing?.path.length);
 const saved=await readWorld(assist);assert.deepEqual(await readWorld(assist),saved);
 await mkdir(dir,{recursive:true});await writeFile(dir+'/result.json',JSON.stringify({passed:true,externalCalls:0,model:'local controlled HTTP fixture, NOT Qwen semantic validation',worlds,timeline,requests,stories:{cafeArrival:arrival,social:socialDone,assist:helped},recovery:{world:assist,snapshot:saved,movingWorld:restart,moving}},null,2));console.log(JSON.stringify({dir,passed:true,worlds:worlds.length,localModelCalls:requests.length}));
}finally{model.closeAllConnections();await new Promise<void>(r=>model.close(()=>r()));await database().end();}
