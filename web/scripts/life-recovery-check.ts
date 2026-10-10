import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFile,writeFile} from 'node:fs/promises';
import {Pool} from 'pg';
import {restoreWorld,advanceWorld,assertWorld} from '../src/lib/world';
const u=new URL(process.env.DATABASE_URL!);assert.equal(u.hostname,'127.0.0.1');assert.equal(u.port,'55488');assert.equal(u.pathname,'/ai_town_mvp_test');
assert.ok(process.argv.includes('--restart-test-postgres'));
const file=process.env.LIFE_RESULT!;const story=JSON.parse(await readFile(file,'utf8'));assert.match(story.id,/^life-browser-[a-f0-9-]+$/);
const container='ai-town-selfbuilt-test-db-1';
const ports=JSON.parse(execFileSync('docker',['inspect','--format','{{json .NetworkSettings.Ports}}',container],{encoding:'utf8'}));const mounts=JSON.parse(execFileSync('docker',['inspect','--format','{{json .Mounts}}',container],{encoding:'utf8'}));
assert.deepEqual(ports['5432/tcp'],[{HostIp:'127.0.0.1',HostPort:'55488'}]);assert.ok(mounts.some((m:{Name:string})=>m.Name==='ai-town-selfbuilt_town_test'));
const beforePool=new Pool({connectionString:process.env.DATABASE_URL,max:1});const before=(await beforePool.query('SELECT payload FROM town_worlds WHERE id=$1',[story.id])).rows[0].payload;const bootBefore=(await beforePool.query('SELECT pg_postmaster_start_time() AS boot')).rows[0].boot;await beforePool.end();
execFileSync('docker',['restart',container],{encoding:'utf8',timeout:30000});
const pool=new Pool({connectionString:process.env.DATABASE_URL,max:1,connectionTimeoutMillis:2000});
try{
 for(let i=0;i<30;i++){try{await pool.query('SELECT 1');break;}catch{await new Promise(r=>setTimeout(r,500));}}
 const after=(await pool.query('SELECT payload FROM town_worlds WHERE id=$1',[story.id])).rows[0].payload;const bootAfter=(await pool.query('SELECT pg_postmaster_start_time() AS boot')).rows[0].boot;
 assert.notDeepEqual(bootAfter,bootBefore);assert.deepEqual(after,before);assert.deepEqual(after,story.paused);const restored=restoreWorld(after);const next=advanceWorld(restored);assertWorld(next);
 assert.equal(next.minute,restored.minute+2);assert.ok(next.lifeExpressions!.every(e=>e.minute<=next.minute));
 await writeFile(file.replace('result.json','postgres-recovery.json'),JSON.stringify({id:story.id,bootBefore,bootAfter,exactRestoration:true,observations:after.lifeExpressions.length,conversations:after.conversations.length,continuedLegally:true,mainDatabaseTouched:false},null,2));console.log('Actual isolated PostgreSQL restart: exact observations, actions, conversations and world restored.');
}finally{await pool.end();}
