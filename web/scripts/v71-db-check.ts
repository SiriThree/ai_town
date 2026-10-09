import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {mkdir,writeFile} from "node:fs/promises";
import {database,readWorld,initializeWorld,tickWorld,setWorldRunning,wakeWorld} from "../src/lib/store";
import {advanceWorld,createWorld,restoreWorld} from "../src/lib/world";
if(new URL(process.env.DATABASE_URL||"").pathname!=="/ai_town_mvp_test")throw new Error("仅允许隔离测试库");
const id=`v71-${randomUUID()}`,legacyId=id+"-legacy",dir="evidence/v7-1/database",checks:string[]=[];
await mkdir(dir,{recursive:true});
try{
  const legacy=JSON.parse(JSON.stringify(createWorld()));legacy.schemaVersion=1;legacy.revision=57;legacy.minute=960;
  for(const n of legacy.npcs)delete n.sceneId;
  Object.assign(legacy.npcs[0],{location:"cafe",position:{x:746,y:306},hunger:85,action:"享用餐点"});
  await database().query("INSERT INTO town_worlds(id,revision,payload) VALUES($1,$2,$3)",[legacyId,legacy.revision,JSON.stringify(legacy)]);
  const oldChat=[{id:"preserved",message:"旧访客历史",reply:"原文保留"}];
  await database().query("INSERT INTO town_private_chats(world_id,npc_id,visitor_id,turns) VALUES($1,'aqing',$2,$3)",[legacyId,"a".repeat(64),JSON.stringify(oldChat)]);
  const restored=await readWorld(legacyId);assert.deepEqual(restored,restoreWorld(legacy));
  assert.deepEqual((await database().query("SELECT payload FROM town_worlds WHERE id=$1",[legacyId])).rows[0].payload,legacy);
  const approached=await tickWorld(57,legacyId);assert.equal(approached.npcs[0].sceneId,"town");assert.equal(approached.npcs[0].position.y,324);
  assert.equal((await database().query("SELECT payload FROM town_worlds WHERE id=$1",[legacyId])).rows[0].payload.schemaVersion,2);
  assert.deepEqual((await database().query("SELECT turns FROM town_private_chats WHERE world_id=$1",[legacyId])).rows[0].turns,oldChat);
  checks.push("真实v1旧咖啡馆存档按室外恢复且读不改库；首次事务写入v2，时间/版本正常推进，旧私聊原样保留");
  await initializeWorld(id);const door=await tickWorld(0,id);
  await setWorldRunning(true,door.revision,id);
  async function due(){await database().query("UPDATE town_worlds SET payload=jsonb_set(payload,'{run,nextTickAt}','1'::jsonb) WHERE id=$1",[id]);}
  await due();const before=await readWorld(id);const replies=await Promise.all(Array.from({length:8},()=>wakeWorld(id)));
  const entered=await readWorld(id);assert.equal(entered.npcs[0].sceneId,"cafe_interior");assert.equal(entered.minute,before.minute+10);
  assert.ok(replies.every(w=>w.revision===entered.revision));assert.equal(entered.events.filter(e=>e.npcId==="aqing"&&e.text.includes("进入麦香")).length,1);
  const paused=await setWorldRunning(false,0,id);assert.deepEqual(await initializeWorld(id),paused);
  const eaten=await tickWorld(paused.revision,id);assert.equal(eaten.npcs[0].action,"享用餐点");
  await setWorldRunning(true,eaten.revision,id);await due();
  const exitBefore=await readWorld(id);await Promise.all(Array.from({length:8},()=>wakeWorld(id)));const exited=await readWorld(id);
  assert.equal(exited.npcs[0].sceneId,"town");assert.equal(exited.minute,exitBefore.minute+10);
  assert.equal(exited.events.filter(e=>e.npcId==="aqing"&&e.text.includes("离开麦香")).length,1);
  assert.deepEqual(exited.npcs,advanceWorld(exitBefore).npcs);
  checks.push("8个并发自动唤醒进入/离开均只发生一次，场景/坐标/事件同事务提交，无重复身份或消失");
  await writeFile(`${dir}/result.json`,JSON.stringify({date:new Date().toISOString(),id,legacyId,checks,legacy,restored,approached,entered,eaten,exited,externalModelCalls:0},null,2));console.log(`${checks.length} V7.1 PostgreSQL groups passed`);
}finally{await database().end();}
