import assert from "node:assert/strict";
import {createServer} from "node:http";
import {readFile,mkdir,writeFile} from "node:fs/promises";
import {database,readWorld} from "../src/lib/store";
import {chat} from "../src/lib/chat-service";
const u=new URL(process.env.DATABASE_URL!);assert.equal(u.hostname,"127.0.0.1");assert.equal(u.port,"55488");assert.equal(u.pathname,"/ai_town_mvp_test");
const source=JSON.parse(await readFile(process.env.STORY_RESULT!,"utf8")),id=source.id;
const w=await readWorld(id),a=w.gatherings![0],yes=a.responses.find(r=>r.participatedMinute!==undefined)!,no=a.responses.find(r=>r.status==="declined")!;
const calls:unknown[]=[];
const server=createServer(async(req,res)=>{let raw="";for await(const c of req)raw+=c;const messages=JSON.parse(raw).messages,facts=JSON.parse(messages[0].content.split("世界事实：\n")[1]);calls.push(facts);res.setHeader("content-type","application/json");res.end(JSON.stringify({choices:[{message:{content:facts.publicActivityKnowledge.firsthandFacts.length?"记得，我在广场参加过那次聚会。":"我参加了昨天的聚会。"}}]}));});
await new Promise<void>(r=>server.listen(0,"127.0.0.1",r));const address=server.address();assert.ok(address&&typeof address!=="string");
Object.assign(process.env,{AI_ENABLED:"true",NPC_AI_ENABLED:"false",AI_TEST_MODE:"true",AI_API_KEY:"local-only",AI_MODEL:"mock",AI_BASE_URL:`http://127.0.0.1:${address.port}/v1`,CHAT_REQUESTS_PER_MINUTE:"120"});
const fetcher=globalThis.fetch;globalThis.fetch=(input,init)=>{assert.equal(String(input),process.env.AI_BASE_URL+"/chat/completions");return fetcher(input,init);};
try{
 const first=await chat(yes.npcId,"还记得昨天聚会吗？","c".repeat(64),id),second=await chat(no.npcId,"还记得昨天聚会吗？","c".repeat(64),id);
 assert.equal(first.source,"ai");assert.equal(first.testMode,true);assert.equal(second.source,"fallback");assert.equal(second.reason,"fact_conflict");assert.match(second.reply,/没有亲自参加/);assert.deepEqual(await readWorld(id),w);
 const json=JSON.stringify(calls);assert.ok(!json.includes("私密舟"));assert.ok(json.includes("gathering:"));
 const dir=`evidence/v12/${id}/model-check`;await mkdir(dir,{recursive:true});await writeFile(`${dir}/result.json`,JSON.stringify({id,localCalls:calls.length,externalCalls:0,first,second,contexts:calls},null,2));console.log(dir);
}finally{globalThis.fetch=fetcher;server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));await database().end();}
