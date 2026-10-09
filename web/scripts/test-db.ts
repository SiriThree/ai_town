import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { database, initializeWorld, readWorld, tickWorld, StoreError } from "../src/lib/store";
const url=new URL(process.env.DATABASE_URL || "");
if(url.pathname!=="/ai_town_mvp_test") throw new Error("只允许使用独立 ai_town_mvp_test 数据库");
const id=`db-check-${randomUUID()}`;
const passed:string[]=[];
try {
  await assert.rejects(()=>readWorld(id),(e:unknown)=>e instanceof StoreError&&e.status===404); passed.push("普通读取不播种");
  const seed=await initializeWorld(id);
  const results=await Promise.allSettled([tickWorld(seed.revision,id),tickWorld(seed.revision,id)]);
  assert.equal(results.filter(r=>r.status==="fulfilled").length,1);
  const rejected=results.find(r=>r.status==="rejected") as PromiseRejectedResult;
  assert.equal(rejected.reason.status,409);passed.push("并发相同版本只成功一次");
  const saved=await readWorld(id);assert.equal(saved.revision,1);assert.equal(saved.events.length,2);
  assert.deepEqual(await initializeWorld(id),saved);passed.push("再次初始化保留推进结果");
  assert.notDeepEqual(saved.npcs,seed.npcs);passed.push("真实 PostgreSQL 保存居民和事件");
  // Corrupt only this random test world's schema marker to verify refusal and rollback.
  // Never touches development or evaluation data; intentionally retained as evidence.
  const client=await database().connect();
  try {
    await client.query("BEGIN");
    await client.query("UPDATE town_worlds SET payload = jsonb_set(payload, '{schemaVersion}', '999') WHERE id=$1",[id]);
    await client.query("COMMIT");
  } finally {client.release();}
  await assert.rejects(()=>tickWorld(1,id));
  const raw=await database().query("SELECT revision,payload FROM town_worlds WHERE id=$1",[id]);
  assert.equal(raw.rows[0].revision,1);assert.equal(raw.rows[0].payload.schemaVersion,999);
  passed.push("不兼容存档拒绝推进且不静默覆盖");
  const goodId=`${id}-restored`;await initializeWorld(goodId);await tickWorld(0,goodId);
  const dir=process.env.EVIDENCE_DIR || "evidence";
  await mkdir(dir,{recursive:true});
  await writeFile(`${dir}/db-check.json`,JSON.stringify({id,goodId,passed,saved},null,2));
  console.log(`${passed.length} database checks passed`,passed);
} finally {await database().end();}
