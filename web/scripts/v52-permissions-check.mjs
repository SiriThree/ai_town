import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {writeFile,mkdir} from "node:fs/promises";
import {Pool} from "pg";
import {database,initializeWorld} from "../src/lib/store.ts";
const url=new URL(process.env.DATABASE_URL||"");if(url.pathname!=="/ai_town_mvp_test")throw new Error("仅允许独立测试库");
const role="town_check_"+randomUUID().replaceAll("-","");
const password=randomUUID(),id=`permissions-${randomUUID()}`;
// Names and dummy password are generated here, not supplied by HTTP or copied from production.
await initializeWorld(id);
await database().query(`CREATE ROLE ${role} LOGIN PASSWORD '${password}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION`);
await database().query(`GRANT CONNECT ON DATABASE ai_town_mvp_test TO ${role}; GRANT USAGE ON SCHEMA public TO ${role}; GRANT SELECT,UPDATE ON town_worlds TO ${role}; GRANT SELECT,INSERT,UPDATE ON town_private_chats,town_chat_limits,town_invitations TO ${role}`);
url.username=role;url.password=password;const runtime=new Pool({connectionString:url.href,max:1});const checks=[];
try{
  assert.equal((await runtime.query("SELECT id FROM town_worlds WHERE id=$1",[id])).rows.length,1);
  await runtime.query("UPDATE town_worlds SET updated_at=updated_at WHERE id=$1",[id]);
  await runtime.query("INSERT INTO town_private_chats(world_id,npc_id,visitor_id,turns) VALUES($1,'aqing',$2,'[]')",[id,"a".repeat(64)]);
  await runtime.query("INSERT INTO town_chat_limits(world_id,kind,bucket,used) VALUES($1,'model',1,1)",[id]);
  checks.push("运行角色可读取/更新世界、读写本人会话表与预算表");
  for(const query of ["SELECT * FROM town_chats LIMIT 1","DELETE FROM town_private_chats WHERE false","INSERT INTO town_worlds(id,revision,payload) VALUES('forbidden',0,'{}')","CREATE TABLE public.forbidden_v52(id int)"]){
    await assert.rejects(runtime.query(query),e=>e.code==="42501");
  }
  checks.push("旧共享聊天读取、删除、世界初始化及DDL均被数据库权限拒绝");
}finally{
  await runtime.end();
  // Leave evidence/data intact but revoke test login, so no working test credential remains.
  await database().query(`ALTER ROLE ${role} NOLOGIN PASSWORD NULL`);await database().end();
}
const dir=process.env.EVIDENCE_DIR||"evidence/v5-2";await mkdir(dir,{recursive:true});await writeFile(`${dir}/permissions.json`,JSON.stringify({date:new Date().toISOString(),worldId:id,role,checks,testRoleDisabled:true,productionTouched:false},null,2));console.log("2 PostgreSQL minimum-permission groups passed; test login disabled");
