import assert from "node:assert/strict";
import {readFile,writeFile,mkdir} from "node:fs/promises";
import {database,readWorld} from "../src/lib/store";
import {chat,chatHistory} from "../src/lib/chat-service";
import {privateAppointments} from "../src/lib/invitation-store";
const u=new URL(process.env.DATABASE_URL!);assert.equal(u.hostname,"127.0.0.1");assert.equal(u.port,"55488");assert.equal(u.pathname,"/ai_town_mvp_test");
Object.assign(process.env,{AI_ENABLED:"false",NPC_AI_ENABLED:"false"});
const result=JSON.parse(await readFile(process.env.STORY_RESULT!,"utf8")),id=result.id,visitor="a".repeat(64),dir="evidence/v11-4/recall-after-restart";
try{
 const w=await readWorld(id),history=await chatHistory("aning",visitor,id);
 const memory=(await database().query("SELECT player_memory FROM town_private_chats WHERE world_id=$1 AND npc_id='aning' AND visitor_id=$2",[id,visitor])).rows[0].player_memory;
 assert.ok(w.minute-memory.first.minute>=1440);assert.ok(!history.some(t=>t.id===memory.first.turnId));assert.equal(memory.name,undefined);assert.equal(memory.trust,0);assert.equal(memory.affection,0);
 const turn=await chat("aning","你还记得我吗？",visitor,id);assert.match(turn.reply,/第1天我们聊过/);assert.equal(turn.source,"fallback");
 const appointments=await privateAppointments(id,"aning",visitor);assert.equal(appointments[0].status,"arrived");assert.deepEqual(await privateAppointments(id,"aning","b".repeat(64)),[]);assert.deepEqual(await readWorld(id),w);
 await mkdir(dir,{recursive:true});await writeFile(`${dir}/result.json`,JSON.stringify({id,minute:w.minute,retainedHistory:history.length,firstSourceStillInHistory:false,memory,turn,appointments,externalCalls:0},null,2));console.log("Cross-day sourced memory after new Node process and test PostgreSQL restart passed",id);
}finally{await database().end();}
