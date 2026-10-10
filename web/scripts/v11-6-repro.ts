import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {mkdir,writeFile} from "node:fs/promises";
import {database,initializeWorld,readWorld,tickWorld} from "../src/lib/store";
import {chat} from "../src/lib/chat-service";
import {invitationIntent} from "../src/lib/appointments";
const u=new URL(process.env.DATABASE_URL!);assert.equal(u.port,"55488");assert.equal(u.pathname,"/ai_town_mvp_test");
Object.assign(process.env,{AI_ENABLED:"false",NPC_AI_ENABLED:"false",AI_API_KEY:"",CHAT_REQUESTS_PER_MINUTE:"120"});
const id=`v11-6-before-${randomUUID()}`,visitor="a".repeat(64),dir="evidence/v11-6/before";
try{
 let w=await initializeWorld(id);const timeline=[];
 for(const message of ["我叫 three，你记住了吗？","你还认识我吗？","我叫什么名字？"]){
  const turn=await chat("xiaoman",message,visitor,id);
  const memory=(await database().query("SELECT player_memory FROM town_private_chats WHERE world_id=$1 AND npc_id='xiaoman' AND visitor_id=$2",[id,visitor])).rows[0].player_memory;
  timeline.push({turn,memory,scene:w.npcs.find(n=>n.id==="xiaoman")!.sceneId});
  if(timeline.length===1){for(let i=0;i<720;i++)w=await tickWorld(w.revision,id);}
 }
 const inputs=["待会你有空吗？我想邀请你去咖啡馆喝杯咖啡。","那我们现在就去咖啡馆可以吗？","你什么时候过来呢？"];
 let main:unknown=null;try{const r=await fetch("http://127.0.0.1:3100/api/world");const m=await r.json();main={revision:m.revision,minute:m.minute,residents:m.npcs?.length,readOnly:true};}catch{main={unavailable:true};}
 await mkdir(dir,{recursive:true});await writeFile(`${dir}/result.json`,JSON.stringify({id,sameSyntheticVisitor:true,timeline,intents:inputs.map(message=>({message,intent:invitationIntent(message,"小满")})),main,externalCalls:0},null,2));
 assert.equal(timeline[0].memory.name,undefined);assert.ok(inputs.every(m=>invitationIntent(m,"小满")===null));console.log("Reproduced: explicit compound introduction not saved; all 3 actual invitations/status inputs unrecognized",id);
 assert.equal((await readWorld(id)).minute,w.minute);
}finally{await database().end();}
