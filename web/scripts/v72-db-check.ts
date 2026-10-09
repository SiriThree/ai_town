import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {mkdir,writeFile} from "node:fs/promises";
import {execFileSync} from "node:child_process";
import {Pool} from "pg";
import {database,initializeWorld,readWorld,tickWorld,feedWorld,setWorldRunning,wakeWorld} from "../src/lib/store";
import {createWorld,restoreWorld,assertWorld} from "../src/lib/world";
const url=new URL(process.env.DATABASE_URL||"");
if(url.hostname!=="127.0.0.1"||url.port!=="55488"||url.pathname!=="/ai_town_mvp_test")throw new Error("仅允许本项目隔离测试库55488");
const id=`v72-${randomUUID()}`,dir=process.env.EVIDENCE_DIR||"evidence/v7-2/database",checks:string[]=[];
await mkdir(dir,{recursive:true});let closed=false;
try{
  for(const version of [1,2]){
    const legacy=JSON.parse(JSON.stringify(createWorld()));legacy.schemaVersion=version;legacy.revision=57;legacy.minute=960;
    if(version===1)for(const n of legacy.npcs)delete n.sceneId;
    Object.assign(legacy.npcs[1],{location:"home",position:{x:242,y:306},hunger:0,energy:8,action:"在门廊休息"});
    const legacyId=`${id}-legacy${version}`;
    await database().query("INSERT INTO town_worlds(id,revision,payload) VALUES($1,$2,$3)",[legacyId,57,JSON.stringify(legacy)]);
    const chat=[{id:"preserved",message:"旧访客历史",reply:"原文保留"}];
    await database().query("INSERT INTO town_private_chats(world_id,npc_id,visitor_id,turns) VALUES($1,'aning',$2,$3)",[legacyId,"a".repeat(64),JSON.stringify(chat)]);
    assert.deepEqual(await readWorld(legacyId),restoreWorld(legacy));assert.deepEqual((await database().query("SELECT payload FROM town_worlds WHERE id=$1",[legacyId])).rows[0].payload,legacy);
    const next=await tickWorld(57,legacyId);assert.equal(next.npcs[1].sceneId,"town");assert.deepEqual(next.npcs[1].position,{x:234,y:324});
    assert.deepEqual((await database().query("SELECT turns FROM town_private_chats WHERE world_id=$1",[legacyId])).rows[0].turns,chat);
  }
  checks.push("v1/v2住宅旧存档读不改库，旧坐标保留室外；首个写入只走到新门口，无私聊丢失");
  const seed=createWorld();Object.assign(seed.npcs[1],{energy:8,hunger:0});assertWorld(seed);
  await database().query("INSERT INTO town_worlds(id,revision,payload) VALUES($1,0,$2)",[id,JSON.stringify(seed)]);
  const door=await tickWorld(0,id);await setWorldRunning(true,door.revision,id);
  await database().query("UPDATE town_worlds SET payload=jsonb_set(payload,'{run,nextTickAt}','1'::jsonb) WHERE id=$1",[id]);
  const before=await readWorld(id);const responses=await Promise.all(Array.from({length:8},()=>wakeWorld(id)));
  const entered=await readWorld(id);assert.equal(entered.minute,before.minute+10);assert.equal(entered.npcs[1].sceneId,"home_interior");assert.ok(responses.every(w=>w.revision===entered.revision));
  const paused=await setWorldRunning(false,0,id),bed=await tickWorld(paused.revision,id),rest=await tickWorld(bed.revision,id);
  assert.equal(rest.npcs[1].energy,40);assert.equal(rest.npcs[1].action,"在床边休息");
  // Feed and manual tick both carry the same version: one commits, one conflicts.
  const mixed=await Promise.allSettled([feedWorld("aning",rest.revision,id),tickWorld(rest.revision,id)]);
  assert.equal(mixed.filter(r=>r.status==="fulfilled").length,1);assert.equal((mixed.find(r=>r.status==="rejected") as PromiseRejectedResult).reason.status,409);
  const after=await readWorld(id);assertWorld(after);assert.deepEqual(await initializeWorld(id),after);
  checks.push("8个并发唤醒只进入一次；室内路径/休息同事务保存；同时送食物与推进仅一个版本提交，不互相覆盖；初始化不重置");
  // Preserve a real, progressed bed snapshot for DB process restart verification.
  const persisted=await readWorld(id),raw=(await database().query("SELECT payload FROM town_worlds WHERE id=$1",[id])).rows[0].payload;
  const bootBefore=(await database().query("SELECT pg_postmaster_start_time() AS boot")).rows[0].boot.toISOString();
  await database().end();closed=true;
  let restart:unknown={verified:false,reason:"未指定 --restart-test-postgres"};
  if(process.argv.includes("--restart-test-postgres")){
    const container="ai-town-selfbuilt-test-db-1";
    const ports=JSON.parse(execFileSync("docker",["inspect","--format","{{json .NetworkSettings.Ports}}",container],{encoding:"utf8"}));
    const mounts=JSON.parse(execFileSync("docker",["inspect","--format","{{json .Mounts}}",container],{encoding:"utf8"}));
    assert.deepEqual(ports["5432/tcp"],[{HostIp:"127.0.0.1",HostPort:"55488"}]);
    assert.ok(mounts.some((m:{Name:string;Destination:string})=>m.Name==="ai-town-selfbuilt_town_test"&&m.Destination==="/var/lib/postgresql/data"));
    // Only this project's test DB container restarts; no down, rm, volume or data deletion.
    execFileSync("docker",["restart",container],{encoding:"utf8",timeout:30000});
    const pool=new Pool({connectionString:process.env.DATABASE_URL,max:1,connectionTimeoutMillis:2000});
    try{
      for(let i=0;i<30;i++){try{await pool.query("SELECT 1");break;}catch{await new Promise(r=>setTimeout(r,500));}}
      const restored=(await pool.query("SELECT payload FROM town_worlds WHERE id=$1",[id])).rows[0].payload;
      const bootAfter=(await pool.query("SELECT pg_postmaster_start_time() AS boot")).rows[0].boot.toISOString();
      assert.notEqual(bootBefore,bootAfter);assert.deepEqual(restored,raw);assert.deepEqual(restoreWorld(restored),persisted);
      for(const version of [1,2]){const rows=await pool.query("SELECT turns FROM town_private_chats WHERE world_id=$1",[`${id}-legacy${version}`]);assert.equal(rows.rows[0].turns[0].reply,"原文保留");}
      restart={verified:true,container,bootBefore,bootAfter,sceneId:persisted.npcs[1].sceneId,position:persisted.npcs[1].position,action:persisted.npcs[1].action};
      checks.push("真正重启测试PostgreSQL进程，启动时间改变；已推进床边场景/坐标/行动及旧私聊完全一致，未影响55487开发库");
    }finally{await pool.end();}
  }
  await writeFile(`${dir}/result.json`,JSON.stringify({date:new Date().toISOString(),id,checks,entered,bed,rest,persisted,restart,externalModelCalls:0},null,2));console.log(`${checks.length} V7.2 PostgreSQL groups passed; restart=${process.argv.includes("--restart-test-postgres")}`);
}finally{if(!closed)await database().end();}
