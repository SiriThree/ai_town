import assert from "node:assert/strict";
import {readFile,writeFile} from "node:fs/promises";
import {execFileSync} from "node:child_process";
import {Pool} from "pg";
import {randomUUID} from "node:crypto";
import {prepareWork,workPoint} from "../src/lib/work";
import {restoreWorld,createWorld,populateResidents,advanceWorld} from "../src/lib/world";
const url=new URL(process.env.DATABASE_URL||"");
if(url.hostname!=="127.0.0.1"||url.port!=="55488"||url.pathname!=="/ai_town_mvp_test"||!process.argv.includes("--restart-test-postgres"))throw new Error("仅项目隔离测试库，需明确重启参数");
const dir="evidence/v8-v9/v94-final",data=JSON.parse(await readFile(`${dir}/postgres-before.json`,"utf8"));
const container="ai-town-selfbuilt-test-db-1";
const ports=JSON.parse(execFileSync("docker",["inspect","--format","{{json .NetworkSettings.Ports}}",container],{encoding:"utf8"}));
const mounts=JSON.parse(execFileSync("docker",["inspect","--format","{{json .Mounts}}",container],{encoding:"utf8"}));
assert.deepEqual(ports["5432/tcp"],[{HostIp:"127.0.0.1",HostPort:"55488"}]);assert.ok(mounts.some((m:{Name:string;Destination:string})=>m.Name==="ai-town-selfbuilt_town_test"&&m.Destination==="/var/lib/postgresql/data"));
const before=new Pool({connectionString:process.env.DATABASE_URL,max:1});
let pending=populateResidents(createWorld());prepareWork(pending);Object.assign(pending.npcs[2],{sceneId:"cafe_interior",location:"cafe",position:workPoint(pending.npcs[2]),hunger:0,energy:90});pending=advanceWorld(pending);pending.npcs[2].energy=20;pending=advanceWorld(pending);
assert.equal(pending.npcs[2].workTask!.phase,"paused");assert.equal(pending.npcs[2].workTask!.progress,1);const pendingId=`v94-pending-${randomUUID()}`,taskId=pending.npcs[2].workTask!.id;
await before.query("INSERT INTO town_worlds(id,revision,payload) VALUES($1,$2,$3)",[pendingId,pending.revision,JSON.stringify(pending)]);
await writeFile(`${dir}/${pendingId}.json`,JSON.stringify(pending,null,2));
const bootBefore=(await before.query("SELECT pg_postmaster_start_time() AS boot")).rows[0].boot.toISOString();
const privateBefore=(await before.query("SELECT npc_id,visitor_id,turns FROM town_private_chats WHERE world_id=$1 ORDER BY npc_id,visitor_id",[data.worldId])).rows;
await before.end();
// Restarts only the verified test container; never removes containers, volumes or rows.
execFileSync("docker",["restart",container],{encoding:"utf8",timeout:30000});
const after=new Pool({connectionString:process.env.DATABASE_URL,max:1,connectionTimeoutMillis:2000});
try{
 for(let i=0;i<30;i++){try{await after.query("SELECT 1");break;}catch{await new Promise(r=>setTimeout(r,500));}}
 const bootAfter=(await after.query("SELECT pg_postmaster_start_time() AS boot")).rows[0].boot.toISOString();assert.notEqual(bootBefore,bootAfter);
 for(const [id,expected]of [[data.worldId,data.saved],[data.stressId,data.stress],[pendingId,pending]]){const raw=(await after.query("SELECT payload FROM town_worlds WHERE id=$1",[id])).rows[0].payload;assert.deepEqual(raw,expected);assert.deepEqual(restoreWorld(raw),expected);}
 assert.deepEqual((await after.query("SELECT npc_id,visitor_id,turns FROM town_private_chats WHERE world_id=$1 ORDER BY npc_id,visitor_id",[data.worldId])).rows,privateBefore);
 const {tickWorld,database}=await import("../src/lib/store");let resumed=pending;
 try{for(let i=0;i<65;i++){resumed=await tickWorld(resumed.revision,pendingId);assert.equal(resumed.npcs[2].workTask!.id,taskId);if(resumed.npcs[2].workTask!.phase==="completed")break;}assert.equal(resumed.npcs[2].workTask!.phase,"completed");assert.equal(resumed.workHistory!.filter(r=>r.taskId===taskId).length,1);}finally{await database().end();}
 await writeFile(`${dir}/postgres-restart-with-pending.json`,JSON.stringify({verified:true,container,bootBefore,bootAfter,worlds:[data.worldId,data.stressId,pendingId],resumedTask:{taskId,before:pending.npcs[2].workTask,after:resumed.npcs[2].workTask,outputs:resumed.workOutputs},privateThreads:privateBefore.length,checked:"full JSON: scene, position, path, work progress/output, facts, memories, relations, conversations; private rows identical"},null,2));console.log("PostgreSQL actual restart: both full worlds and private rows identical");
}finally{await after.end();}
