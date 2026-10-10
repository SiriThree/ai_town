import assert from "node:assert/strict";
import {readFile,mkdir,writeFile} from "node:fs/promises";
import {randomUUID} from "node:crypto";
import {database,initializeWorld,readWorld} from "../src/lib/store";
import {changeNotice,notices} from "../src/lib/notice-store";
const u=new URL(process.env.DATABASE_URL!);assert.equal(u.hostname,"127.0.0.1");assert.equal(u.port,"55488");assert.equal(u.pathname,"/ai_town_mvp_test");
const id=`v12-board-${randomUUID()}`,owner="a".repeat(64),other="b".repeat(64);
try{
 await database().query(await readFile("scripts/v12-schema.sql","utf8"));await initializeWorld(id);
 const b={action:"publish",content:"今天下午四点，大家来广场聊聊天吧！",startMinute:960,location:"square",requestId:randomUUID()};
 const [a,r]=await Promise.all([changeNotice(id,owner,b),changeNotice(id,owner,b)]);assert.equal(a.noticeId,r.noticeId);assert.equal((await readWorld(id)).gatherings!.length,1);
 const outsider=await notices(id,other);assert.deepEqual(outsider.ownedIds,[]);assert.ok(!JSON.stringify(outsider.world).includes(owner));
 await assert.rejects(changeNotice(id,other,{action:"cancel",id:a.noticeId,requestId:randomUUID()}),/只有发布者/);
 await assert.rejects(changeNotice(id,owner,{...b,startMinute:400,requestId:randomUUID()}),/过去/);
 await assert.rejects(changeNotice(id,owner,{...b,startMinute:1100,requestId:randomUUID()}),/一分钟/);
 await changeNotice(id,owner,{action:"cancel",id:a.noticeId,requestId:randomUUID()});assert.equal((await readWorld(id)).gatherings![0].status,"cancelled");
 const dir=`evidence/v12/${id}`;await mkdir(dir,{recursive:true});await writeFile(`${dir}/result.json`,JSON.stringify({id,passed:true,externalCalls:0,world:await readWorld(id)},null,2));console.log(dir);
}finally{await database().end();}
