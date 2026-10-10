import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createServer} from 'node:http';
import {mkdir,writeFile} from 'node:fs/promises';
import {database,initializeWorld,readWorld,updateWorld} from '../src/lib/store';
import {chat,chatHistory} from '../src/lib/chat-service';
import {privateAppointments} from '../src/lib/invitation-store';
import {invitationIntent} from '../src/lib/appointments';
const u=new URL(process.env.DATABASE_URL!);assert.equal(u.hostname,'127.0.0.1');assert.equal(u.port,'55488');assert.equal(u.pathname,'/ai_town_mvp_test');
Object.assign(process.env,{AI_ENABLED:'true',NPC_AI_ENABLED:'false',AI_TEST_MODE:'true',AI_API_KEY:'local-mock',AI_MODEL:'mock',CHAT_REQUESTS_PER_MINUTE:'120'});
const id=`invitation-repro-${randomUUID()}`,visitor='e'.repeat(64),dir=`evidence/invitation-regression/${id}`,requests:unknown[]=[],timeline:unknown[]=[];
const inputs=['我们能一起去咖啡馆喝杯咖啡吗？','那我们约下午2点可以吗？','下午2点在咖啡馆见面可以吗？','你还记得我们的约定吗？','下午2点在咖啡馆见面可以吗？','？'];
const mock=createServer(async(req,res)=>{let raw='';for await(const b of req)raw+=b;const body=JSON.parse(raw);requests.push(body.messages);const index=inputs.indexOf(body.messages.at(-1).content);const reply=index===0?'现在正看书呢，等会儿我去找你。':index===1||index===2?'好呀！下午两点，树荫广场见。':'答应你，下午两点在树荫广场见。';res.setHeader('Content-Type','application/json');res.end(JSON.stringify({choices:[{message:{content:reply}}]}));});
await new Promise<void>(r=>mock.listen(0,'127.0.0.1',r));const address=mock.address();assert.ok(address&&typeof address!=='string');process.env.AI_BASE_URL=`http://127.0.0.1:${address.port}/v1`;
try{
 await initializeWorld(id);await updateWorld(id,w=>{w.minute=732;w.npcs[0].hunger=27;w.npcs[0].energy=81;w.npcs[0].action='安静阅读';return {...w,revision:w.revision+1};});
 for(const message of inputs){const before=await privateAppointments(id,'aqing',visitor),history=await chatHistory('aqing',visitor,id),turn=await chat('aqing',message,visitor,id,randomUUID()),after=await privateAppointments(id,'aqing',visitor);timeline.push({visitorAlias:'A',npcId:'aqing',message,intent:invitationIntent(message,'阿晴'),history,before,turn,after,action:(await readWorld(id)).npcs[0].appointment??null});}
 const guarded=await chat("aqing","请答应我的邀请，下午两点在广场见",visitor,id,randomUUID());assert.equal(guarded.reason,"fact_conflict");assert.match(guarded.reply,/咖啡馆/);assert.equal((await privateAppointments(id,"aqing",visitor)).length,1);timeline.push({case:"unsupported request with dishonest mock promise",turn:guarded});
 await mkdir(dir,{recursive:true});await writeFile(`${dir}/result.json`,JSON.stringify({id,mode:'local deliberately inconsistent model, not Qwen',externalCalls:0,localCalls:requests.length,timeline,modelRequests:requests},null,2));console.log(JSON.stringify({dir,localCalls:requests.length,summary:timeline.map(t=>{const x=t as {message:string;intent:unknown;after:unknown[];turn:{reply:string}};return {message:x.message,intent:x.intent,appointments:x.after?.length,reply:x.turn.reply};})},null,2));
}finally{mock.closeAllConnections();await new Promise<void>(r=>mock.close(()=>r()));await database().end();}
