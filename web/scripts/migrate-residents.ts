import {database,migrateResidents,readWorld,worldId} from "../src/lib/store";
import {mkdir,writeFile} from "node:fs/promises";
// Deliberate local operation; ordinary world reads never add or overwrite residents.
const u=new URL(process.env.DATABASE_URL||"");
if(u.hostname!=="127.0.0.1"||!["55487","55488"].includes(u.port)||!(u.port==="55487"?u.pathname==="/ai_town_mvp":u.pathname==="/ai_town_mvp_test")||!process.argv.includes("--apply"))throw new Error("仅本项目本机库；需显式 --apply，先保留备份");
try{
  const before=await readWorld();const dir="evidence/v8-v9/roster-migration";await mkdir(dir,{recursive:true});
  await writeFile(`${dir}/${worldId()}-${before.revision}-before.json`,JSON.stringify(before,null,2),{flag:"wx"});
  const next=await migrateResidents();console.log(JSON.stringify({worldId:worldId(),before:before.revision,after:next.revision,residents:next.npcs.length}));
}finally{await database().end();}
