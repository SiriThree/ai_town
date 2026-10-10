import assert from "node:assert/strict";
import {readFile,writeFile,mkdir} from "node:fs/promises";
import {database,readWorld} from "../src/lib/store";
import {chat} from "../src/lib/chat-service";
import {privateConversationState} from "../src/lib/invitation-store";
const u=new URL(process.env.DATABASE_URL!);assert.equal(u.hostname,"127.0.0.1");assert.equal(u.port,"55488");assert.equal(u.pathname,"/ai_town_mvp_test");
Object.assign(process.env,{AI_ENABLED:"false",AI_API_KEY:"",NPC_AI_ENABLED:"false"});
const story=JSON.parse(await readFile(process.env.STORY_RESULT!,"utf8")),visitor="a".repeat(64),dir="evidence/v11-6/restored";
try{
 const w=await readWorld(story.id),name=await chat("xiaoman","我叫什么名字？",visitor,story.id);
 assert.match(name.reply,/four/);assert.equal(name.source,"fallback");assert.deepEqual(await readWorld(story.id),w);
 const memory=(await database().query("SELECT player_memory FROM town_private_chats WHERE world_id=$1 AND npc_id='xiaoman' AND visitor_id=$2",[story.id,visitor])).rows[0].player_memory;
 assert.deepEqual(memory.nameFact,story.memory.nameFact);
 const client=await database().connect();let meeting;
 try{meeting=await privateConversationState(client,story.extraIds[0],"xiaoman",visitor,"还记得我们的约定吗？");assert.ok(meeting.recall.events.some(e=>e.kind==="met"));assert.deepEqual((await privateConversationState(client,story.extraIds[0],"xiaoman","b".repeat(64),"记得我吗？")).recall.events,[]);}finally{client.release();}
 // An ordinary affirmation without a pending proposal remains ordinary chat.
 await chat("xiaoman","好的",visitor,story.id);assert.equal((await database().query("SELECT count(*)::int AS n FROM town_invitations WHERE world_id=$1",[story.id])).rows[0].n,0);
 await mkdir(dir,{recursive:true});await writeFile(`${dir}/result.json`,JSON.stringify({id:story.id,name,memory,meeting:meeting.recall,worldUnchanged:true,externalCalls:0},null,2));console.log("New process after PostgreSQL restart: sourced name/correction and actual meeting restored; ordinary assent creates no invitation");
}finally{await database().end();}
