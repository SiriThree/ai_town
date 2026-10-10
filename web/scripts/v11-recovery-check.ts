import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {execFileSync} from "node:child_process";
import {mkdir,writeFile,readFile} from "node:fs/promises";
import {Pool} from "pg";
import {database,initializeWorld,readWorld,tickWorld} from "../src/lib/store";
import {chat} from "../src/lib/chat-service";
import {restoreWorld,advanceWorld,assertWorld} from "../src/lib/world";
const u=new URL(process.env.DATABASE_URL!);assert.equal(u.hostname,"127.0.0.1");assert.equal(u.port,"55488");assert.equal(u.pathname,"/ai_town_mvp_test");assert.ok(process.argv.includes("--restart-test-postgres"));
process.env.AI_ENABLED="false";process.env.NPC_AI_ENABLED="false";
const container="ai-town-selfbuilt-test-db-1",id=`v11-recovery-${randomUUID()}`,visitor="d".repeat(64),dir=process.env.EVIDENCE_DIR||"evidence/v11/recovery";
const ports=JSON.parse(execFileSync("docker",["inspect","--format","{{json .NetworkSettings.Ports}}",container],{encoding:"utf8"}));
const mounts=JSON.parse(execFileSync("docker",["inspect","--format","{{json .Mounts}}",container],{encoding:"utf8"}));
assert.deepEqual(ports["5432/tcp"],[{HostIp:"127.0.0.1",HostPort:"55488"}]);assert.ok(mounts.some((m:{Name:string})=>m.Name==="ai-town-selfbuilt_town_test"));
await initializeWorld(id);await chat("aning","我叫归舟",visitor,id);await chat("aning","我们一起去咖啡馆吧",visitor,id,randomUUID());
let w=await readWorld(id);w=await tickWorld(w.revision,id);assert.ok(w.npcs[1].ongoing?.path.length);
const story=JSON.parse(await readFile(process.env.STORY_RESULT||"evidence/v11/invitation-db/result.json","utf8"));
const ids=[id,story.id,...(story.extraIds??[])];
async function snapshot(pool:Pool){return {
 worlds:(await pool.query("SELECT id,payload FROM town_worlds WHERE id=ANY($1) ORDER BY id",[ids])).rows,
 chats:(await pool.query("SELECT world_id,npc_id,visitor_id,turns,player_memory FROM town_private_chats WHERE world_id=ANY($1) ORDER BY world_id,npc_id,visitor_id",[ids])).rows,
 invites:(await pool.query("SELECT world_id,id,payload,response FROM town_invitations WHERE world_id=ANY($1) ORDER BY id",[ids])).rows
};}
const before=await snapshot(database()),bootBefore=(await database().query("SELECT pg_postmaster_start_time() AS boot")).rows[0].boot.toISOString();await database().end();
execFileSync("docker",["restart",container],{timeout:30000,encoding:"utf8"});
const pool=new Pool({connectionString:process.env.DATABASE_URL,max:1,connectionTimeoutMillis:2000});
try{
 for(let i=0;i<30;i++){try{await pool.query("SELECT 1");break;}catch{await new Promise(r=>setTimeout(r,500));}}
 const bootAfter=(await pool.query("SELECT pg_postmaster_start_time() AS boot")).rows[0].boot.toISOString();assert.notEqual(bootBefore,bootAfter);
 const after=await snapshot(pool);assert.deepEqual(after,before);
 const restored=restoreWorld(after.worlds.find(r=>r.id===id)!.payload);assertWorld(restored);const next=advanceWorld(restored);assertWorld(next);
 assert.equal(next.npcs[1].ongoing?.id,restored.npcs[1].ongoing?.id);assert.equal(next.npcs[1].ongoing!.elapsedMs,restored.npcs[1].ongoing!.elapsedMs+1000);
 await mkdir(dir,{recursive:true});await writeFile(`${dir}/result.json`,JSON.stringify({id,ids,bootBefore,bootAfter,worlds:after.worlds.length,privateChats:after.chats.length,privateAppointments:after.invites.length,exactRestoration:true,sameActionResumed:true,mainDatabaseTouched:false},null,2));console.log("V11 actual PostgreSQL restart: worlds, private memories, invitations and in-flight action preserved");
}finally{await pool.end();}
