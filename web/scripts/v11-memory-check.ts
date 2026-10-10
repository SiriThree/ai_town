import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {mkdir,writeFile} from "node:fs/promises";
import {database,initializeWorld,readWorld,updateWorld} from "../src/lib/store";
import {chat,chatHistory} from "../src/lib/chat-service";
process.env.AI_ENABLED="false";process.env.NPC_AI_ENABLED="false";
const url=new URL(process.env.DATABASE_URL!);assert.equal(url.hostname,"127.0.0.1");assert.equal(url.port,"55488");assert.equal(url.pathname,"/ai_town_mvp_test");
const id=`v11-memory-${randomUUID()}`,a="a".repeat(64),b="b".repeat(64),dir="evidence/v11/memory";
try{
 await initializeWorld(id);const before=await readWorld(id);
 assert.match((await chat("aning","你还记得我吗",a,id)).reply,/还没有/);
 await chat("aning","我叫小舟",a,id);
 assert.match((await chat("aning","你还记得我吗",a,id)).reply,/小舟/);
 assert.match((await chat("aning","你还记得我吗",b,id)).reply,/还没有/);
 assert.ok(!JSON.stringify(await chatHistory("aning",b,id)).includes("小舟"));
 assert.deepEqual(await readWorld(id),before);
 await updateWorld(id,w=>({...w,minute:w.minute+1440,revision:w.revision+1}));
 assert.match((await chat("aning","你还记得我吗",a,id)).reply,/第1天/);
 const data=(await database().query("SELECT player_memory FROM town_private_chats WHERE world_id=$1 AND npc_id='aning' AND visitor_id=$2",[id,a])).rows[0].player_memory;
 assert.equal(data.trust,0);assert.equal(data.affection,0);assert.equal(data.meetings,4);
 await mkdir(dir,{recursive:true});await writeFile(`${dir}/result.json`,JSON.stringify({id,checks:["first/repeat/name/cross-day","visitor isolation","chat cannot alter world","trust/affection unchanged"],memory:data,externalCalls:0},null,2));
 console.log("V11.1 PostgreSQL: four checks passed",id);
}finally{await database().end();}
