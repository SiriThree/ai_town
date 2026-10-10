import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import {randomUUID} from "node:crypto";
import {readFile,mkdir,writeFile} from "node:fs/promises";
import {Pool} from "pg";
import {database,initializeWorld,readWorld,tickWorld} from "../src/lib/store";
import {changeNotice} from "../src/lib/notice-store";
import {advanceWorld,restoreWorld,assertWorld} from "../src/lib/world";
const u=new URL(process.env.DATABASE_URL!);assert.equal(u.hostname,"127.0.0.1");assert.equal(u.port,"55488");assert.equal(u.pathname,"/ai_town_mvp_test");assert.ok(process.argv.includes('--restart-test-postgres'));
const container="ai-town-selfbuilt-test-db-1";
const ports=JSON.parse(execFileSync('docker',['inspect','--format','{{json .NetworkSettings.Ports}}',container],{encoding:'utf8'}));
const mounts=JSON.parse(execFileSync('docker',['inspect','--format','{{json .Mounts}}',container],{encoding:'utf8'}));
assert.deepEqual(ports['5432/tcp'],[{HostIp:'127.0.0.1',HostPort:'55488'}]);assert.ok(mounts.some((m:{Name:string})=>m.Name==='ai-town-selfbuilt_town_test'));
const story=JSON.parse(await readFile(process.env.STORY_RESULT!,'utf8')),browser=JSON.parse(await readFile(process.env.BROWSER_RESULT!,'utf8'));
const id=`v12-recovery-${randomUUID()}`,ids=[id,story.id,browser.id],dir=`evidence/v12/${id}`;
await initializeWorld(id);let w=await readWorld(id);await changeNotice(id,'d'.repeat(64),{action:'publish',content:'来广场聚会吧',location:'square',startMinute:w.minute+90,requestId:randomUUID()});
let moving;
for(let i=0;i<75;i++){w=await readWorld(id);w=await tickWorld(w.revision,id);moving=w.npcs.find(n=>n.ongoing?.path.length&&w.gatherings![0].responses.some(r=>r.npcId===n.id&&r.status==='travelling'));if(moving)break;}assert.ok(moving?.ongoing);
async function snapshot(pool:Pool){return {
 worlds:(await pool.query('SELECT id,payload FROM town_worlds WHERE id=ANY($1) ORDER BY id',[ids])).rows,
 owners:(await pool.query('SELECT * FROM town_notice_owners WHERE world_id=ANY($1) ORDER BY id',[ids])).rows,
 visits:(await pool.query('SELECT * FROM town_gathering_visits WHERE notice_id IN (SELECT id FROM town_notice_owners WHERE world_id=ANY($1)) ORDER BY id',[ids])).rows,
 chats:(await pool.query('SELECT world_id,npc_id,visitor_id,turns,player_memory FROM town_private_chats WHERE world_id=ANY($1) ORDER BY world_id,npc_id,visitor_id',[ids])).rows
};}
const before=await snapshot(database()),bootBefore=(await database().query('SELECT pg_postmaster_start_time() AS boot')).rows[0].boot;await database().end();
execFileSync('docker',['restart',container],{encoding:'utf8',timeout:30000});const pool=new Pool({connectionString:process.env.DATABASE_URL,max:1,connectionTimeoutMillis:2000});
try{
 for(let i=0;i<30;i++){try{await pool.query('SELECT 1');break;}catch{await new Promise(r=>setTimeout(r,500));}}
 const after=await snapshot(pool),bootAfter=(await pool.query('SELECT pg_postmaster_start_time() AS boot')).rows[0].boot;assert.notDeepEqual(bootBefore,bootAfter);assert.deepEqual(after,before);
 const restored=restoreWorld(after.worlds.find(r=>r.id===id)!.payload),next=advanceWorld(restored);assertWorld(next);
 const n=next.npcs.find(n=>n.id===moving!.id)!;assert.equal(n.ongoing?.id,moving.ongoing!.id);assert.equal(n.ongoing!.elapsedMs,moving.ongoing!.elapsedMs+1000);
 await mkdir(dir,{recursive:true});await writeFile(`${dir}/result.json`,JSON.stringify({ids,bootBefore,bootAfter,worlds:after.worlds.length,owners:after.owners.length,visits:after.visits.length,privateChats:after.chats.length,exactRestoration:true,sameMovementResumed:true,externalCalls:0,mainDatabaseTouched:false},null,2));console.log(dir);
}finally{await pool.end();}
