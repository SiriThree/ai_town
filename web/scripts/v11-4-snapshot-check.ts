import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {createServer} from "node:http";
import {mkdir,writeFile} from "node:fs/promises";
import {database,initializeWorld,readWorld,tickWorld} from "../src/lib/store";
import {chat} from "../src/lib/chat-service";
const u=new URL(process.env.DATABASE_URL!);assert.equal(u.hostname,"127.0.0.1");assert.equal(u.port,"55488");assert.equal(u.pathname,"/ai_town_mvp_test");
Object.assign(process.env,{AI_ENABLED:"true",AI_TEST_MODE:"true",AI_API_KEY:"local-only",AI_MODEL:"mock",NPC_AI_ENABLED:"false",CHAT_REQUESTS_PER_MINUTE:"120"});
const id=`v11-4-snapshot-${randomUUID()}`,visitor="a".repeat(64),dir=process.env.EVIDENCE_DIR||"evidence/v11-4/snapshot-before";
let facts:Record<string,unknown>={},pending:Promise<unknown>|undefined;
const server=createServer(async(req,res)=>{let raw="";for await(const chunk of req)raw+=chunk;const b=JSON.parse(raw);facts=JSON.parse(b.messages[0].content.split("世界事实：\n")[1]);res.setHeader("content-type","application/json");res.end(JSON.stringify({choices:[{message:{content:"我按已确认的约定来咖啡馆。"}}]}));});
await new Promise<void>(r=>server.listen(0,"127.0.0.1",r));const address=server.address();assert.ok(address&&typeof address!=="string");process.env.AI_BASE_URL=`http://127.0.0.1:${address.port}/v1`;
const blocker=await database().connect();
try{
 await initializeWorld(id);await chat("aning","我们一起去咖啡馆吧",visitor,id,randomUUID());const start=await readWorld(id);
 await blocker.query("BEGIN");await blocker.query("SELECT * FROM town_chat_limits WHERE world_id=$1 AND kind='request' FOR UPDATE",[id]);
 pending=chat("aning","你为什么来这里？",visitor,id);
 // Wait for the real request quota UPSERT to block, after chat's initial world read.
 for(let i=0;i<100;i++){const r=await database().query("SELECT 1 FROM pg_stat_activity WHERE wait_event_type='Lock' AND query LIKE '%INSERT INTO town_chat_limits%' AND pid<>pg_backend_pid()");if(r.rows.length)break;await new Promise(r=>setTimeout(r,20));if(i===99)throw Error("quota lock not observed");}
 let w=start;for(let i=0;i<100&&w.npcs[1].appointment?.status!=="arrived";i++)w=await tickWorld(w.revision,id);
 assert.equal(w.npcs[1].appointment?.status,"arrived");await blocker.query("COMMIT");await pending;
 const appointments=facts.privateAppointments as {status:string}[];
 const consistent=facts.sceneId==="cafe_interior"&&appointments[0].status==="arrived"&&facts.worldRevision===w.revision;
 await mkdir(dir,{recursive:true});await writeFile(`${dir}/result.json`,JSON.stringify({id,consistent,initialRevision:start.revision,actualRevision:w.revision,modelFacts:facts,externalCalls:0},null,2));
 console.log(JSON.stringify({consistent,modelRevision:facts.worldRevision,actualRevision:w.revision,modelScene:facts.sceneId,appointment:appointments[0].status}));
 if(process.argv.includes("--expect-consistent"))assert.ok(consistent);
}finally{await blocker.query("ROLLBACK");blocker.release();await pending?.catch(()=>{});server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));await database().end();}

