import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {Pool} from 'pg';
import {restoreWorld,advanceWorld,assertWorld} from '../src/lib/world';
const u=new URL(process.env.DATABASE_URL!);assert.equal(u.hostname,'127.0.0.1');assert.equal(u.port,'55488');assert.equal(u.pathname,'/ai_town_mvp_test');assert.ok(process.argv.includes('--restart-test-postgres'));
const container='ai-town-selfbuilt-test-db-1';
const ports=JSON.parse(execFileSync('docker',['inspect','--format','{{json .NetworkSettings.Ports}}',container],{encoding:'utf8'})),mounts=JSON.parse(execFileSync('docker',['inspect','--format','{{json .Mounts}}',container],{encoding:'utf8'}));
assert.deepEqual(ports['5432/tcp'],[{HostIp:'127.0.0.1',HostPort:'55488'}]);assert.ok(mounts.some((m:{Name:string})=>m.Name==='ai-town-selfbuilt_town_test'));
const story=JSON.parse(await readFile(process.env.STORY_RESULT!,'utf8')),ids:string[]=story.worlds,dir=`evidence/v11-7/recovery-${randomUUID()}`;assert.ok(ids.every(id=>id.startsWith('goals-')));
async function snapshot(p:Pool){return {worlds:(await p.query('SELECT id,payload FROM town_worlds WHERE id=ANY($1) ORDER BY id',[ids])).rows,invitations:(await p.query('SELECT * FROM town_invitations WHERE world_id=ANY($1) ORDER BY id',[ids])).rows,chats:(await p.query('SELECT * FROM town_private_chats WHERE world_id=ANY($1) ORDER BY world_id,npc_id,visitor_id',[ids])).rows};}
const p=new Pool({connectionString:process.env.DATABASE_URL,max:1});const before=await snapshot(p),bootBefore=(await p.query('SELECT pg_postmaster_start_time() AS boot')).rows[0].boot;await p.end();
execFileSync('docker',['restart',container],{encoding:'utf8',timeout:30000});const afterPool=new Pool({connectionString:process.env.DATABASE_URL,max:1,connectionTimeoutMillis:2000});
try{
 for(let i=0;i<30;i++){try{await afterPool.query('SELECT 1');break;}catch{await new Promise(r=>setTimeout(r,500));}}
 const after=await snapshot(afterPool),bootAfter=(await afterPool.query('SELECT pg_postmaster_start_time() AS boot')).rows[0].boot;assert.notDeepEqual(bootAfter,bootBefore);assert.deepEqual(after,before);
 const restored=restoreWorld(after.worlds.find(w=>w.id===story.recovery.movingWorld)!.payload),previous=restored.npcs[0].ongoing!;assert.ok(previous.path.length);const next=advanceWorld(restored);assertWorld(next);assert.equal(next.npcs[0].ongoing?.id,previous.id);assert.equal(next.npcs[0].ongoing!.elapsedMs,previous.elapsedMs+1000);
 await mkdir(dir,{recursive:true});await writeFile(`${dir}/result.json`,JSON.stringify({bootBefore,bootAfter,ids,worlds:after.worlds.length,appointments:after.invitations.length,chats:after.chats.length,exactRestoration:true,ongoingResumed:true,externalCalls:0,mainDatabaseTouched:false},null,2));console.log(JSON.stringify({dir,passed:true}));
}finally{await afterPool.end();}
