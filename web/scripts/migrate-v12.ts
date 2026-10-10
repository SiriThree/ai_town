import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {database} from "../src/lib/store";
const u=new URL(process.env.DATABASE_URL!);
assert.equal(u.hostname,"127.0.0.1");assert.ok(u.port==="55487"&&u.pathname==="/ai_town_mvp"||u.port==="55488"&&u.pathname==="/ai_town_mvp_test");
if(!process.argv.includes('--apply'))throw Error('仅追加公告归属/现场会面表；明确传入 --apply 才执行，不播种世界。');
try{
 const sql=await readFile(new URL('./v12-schema.sql',import.meta.url),'utf8');
 // This reviewed migration contains CREATE TABLE/INDEX IF NOT EXISTS only.
 assert.ok(!/\b(?:DROP|DELETE|UPDATE|TRUNCATE|INSERT|ALTER)\b/i.test(sql));
 await database().query(sql);console.log('V12 两张追加表及索引就绪；未写入、重置或播种任何世界/私聊。');
}finally{await database().end();}
