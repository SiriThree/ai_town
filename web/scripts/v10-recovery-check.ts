import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {readFile,writeFile,mkdir} from "node:fs/promises";
import {execFileSync} from "node:child_process";
import {Pool} from "pg";
import {createWorld,populateResidents,advanceWorld,restoreWorld,assertWorld} from "../src/lib/world";
const url=new URL(process.env.DATABASE_URL||"");
if(url.hostname!=="127.0.0.1"||url.port!=="55488"||url.pathname!=="/ai_town_mvp_test"||!process.argv.includes("--restart-test-postgres"))throw Error("仅已配置的隔离测试库；需要显式参数");
const dir="evidence/v10-life/recovery",container="ai-town-selfbuilt-test-db-1",id=`v10-recovery-${randomUUID()}`;
await mkdir(dir,{recursive:true});
const ports=JSON.parse(execFileSync("docker",["inspect","--format","{{json .NetworkSettings.Ports}}",container],{encoding:"utf8"}));
const mounts=JSON.parse(execFileSync("docker",["inspect","--format","{{json .Mounts}}",container],{encoding:"utf8"}));
assert.deepEqual(ports["5432/tcp"],[{HostIp:"127.0.0.1",HostPort:"55488"}]);assert.ok(mounts.some((m:{Name:string;Destination:string})=>m.Name==="ai-town-selfbuilt_town_test"&&m.Destination==="/var/lib/postgresql/data"));
let moving=populateResidents(createWorld());moving.npcs[0].hunger=80;moving=advanceWorld(moving);assert.ok(moving.npcs.some(n=>n.ongoing?.path.length));assertWorld(moving);
const chatWorld=JSON.parse(await readFile("evidence/v10-life/interaction-concurrent/result.json","utf8")).id;
const pool=new Pool({connectionString:process.env.DATABASE_URL,max:1});
await pool.query("INSERT INTO town_worlds(id,revision,payload) VALUES($1,$2,$3)",[id,moving.revision,JSON.stringify(moving)]);
const history=(await pool.query("SELECT npc_id,visitor_id,turns FROM town_private_chats WHERE world_id=$1 ORDER BY npc_id,visitor_id",[chatWorld])).rows;
assert.ok(history.length>=2);
const bootBefore=(await pool.query("SELECT pg_postmaster_start_time() AS boot")).rows[0].boot.toISOString();await pool.end();
execFileSync("docker",["restart",container],{encoding:"utf8",timeout:30000});
const after=new Pool({connectionString:process.env.DATABASE_URL,max:1,connectionTimeoutMillis:2000});
try{
 for(let i=0;i<30;i++){try{await after.query("SELECT 1");break;}catch{await new Promise(r=>setTimeout(r,500));}}
 const bootAfter=(await after.query("SELECT pg_postmaster_start_time() AS boot")).rows[0].boot.toISOString();assert.notEqual(bootBefore,bootAfter);
 const saved=(await after.query("SELECT payload FROM town_worlds WHERE id=$1",[id])).rows[0].payload;assert.deepEqual(saved,moving);assert.deepEqual(restoreWorld(saved),moving);
 assert.deepEqual((await after.query("SELECT npc_id,visitor_id,turns FROM town_private_chats WHERE world_id=$1 ORDER BY npc_id,visitor_id",[chatWorld])).rows,history);
 const resumed=advanceWorld(saved);assertWorld(resumed);assert.equal(resumed.npcs[0].ongoing!.id,moving.npcs[0].ongoing!.id);assert.equal(resumed.npcs[0].ongoing!.elapsedMs,moving.npcs[0].ongoing!.elapsedMs+1000);
 await writeFile(`${dir}/result.json`,JSON.stringify({passed:true,id,chatWorld,container,bootBefore,bootAfter,fullWorldIdentical:true,privateThreads:history.length,sameActionResumed:true,mainDatabaseTouched:false},null,2));console.log("V10 PostgreSQL restart and in-flight continuation passed");
}finally{await after.end();}
