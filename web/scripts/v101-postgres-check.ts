import assert from "node:assert/strict";
import {readFile,writeFile} from "node:fs/promises";
import {execFileSync} from "node:child_process";
import {Pool} from "pg";
import {restoreWorld} from "../src/lib/world";
const url=new URL(process.env.DATABASE_URL||"");
if(url.hostname!=="127.0.0.1"||url.port!=="55488"||url.pathname!=="/ai_town_mvp_test"||!process.argv.includes("--restart-test-postgres"))throw new Error("仅隔离测试库，需显式重启参数");
const dir="evidence/v10-1/experience",{worldId,saved}=JSON.parse(await readFile(`${dir}/postgres-before.json`,"utf8")),container="ai-town-selfbuilt-test-db-1";
const ports=JSON.parse(execFileSync("docker",["inspect","--format","{{json .NetworkSettings.Ports}}",container],{encoding:"utf8"}));
const mounts=JSON.parse(execFileSync("docker",["inspect","--format","{{json .Mounts}}",container],{encoding:"utf8"}));
assert.deepEqual(ports["5432/tcp"],[{HostIp:"127.0.0.1",HostPort:"55488"}]);assert.ok(mounts.some((m:{Name:string;Destination:string})=>m.Name==="ai-town-selfbuilt_town_test"&&m.Destination==="/var/lib/postgresql/data"));
const before=new Pool({connectionString:process.env.DATABASE_URL,max:1});
const bootBefore=(await before.query("SELECT pg_postmaster_start_time() AS boot")).rows[0].boot.toISOString();
const history=(await before.query("SELECT npc_id,visitor_id,turns FROM town_private_chats WHERE world_id=$1 ORDER BY npc_id,visitor_id",[worldId])).rows;
await before.end();execFileSync("docker",["restart",container],{encoding:"utf8",timeout:30000});
const after=new Pool({connectionString:process.env.DATABASE_URL,max:1,connectionTimeoutMillis:2000});
try{
 for(let i=0;i<30;i++){try{await after.query("SELECT 1");break;}catch{await new Promise(r=>setTimeout(r,500));}}
 const bootAfter=(await after.query("SELECT pg_postmaster_start_time() AS boot")).rows[0].boot.toISOString();assert.notEqual(bootBefore,bootAfter);
 const raw=(await after.query("SELECT payload FROM town_worlds WHERE id=$1",[worldId])).rows[0].payload;assert.deepEqual(raw,saved);assert.deepEqual(restoreWorld(raw),saved);
 assert.deepEqual((await after.query("SELECT npc_id,visitor_id,turns FROM town_private_chats WHERE world_id=$1 ORDER BY npc_id,visitor_id",[worldId])).rows,history);
 await writeFile(`${dir}/postgres-restart.json`,JSON.stringify({passed:true,worldId,container,bootBefore,bootAfter,revision:saved.revision,privateThreads:history.length,fullWorldIdentical:true},null,2));console.log("PostgreSQL restart: complete world and chat unchanged");
}finally{await after.end();}
