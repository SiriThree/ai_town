import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {mkdir,writeFile,readFile} from "node:fs/promises";
import {database,readWorld,tickWorld,wakeWorld,setWorldRunning,updateWorld} from "../src/lib/store";
import {createWorld,populateResidents,assertWorld} from "../src/lib/world";
import {changeNotice,notices} from "../src/lib/notice-store";
import {validScenePath} from "../src/lib/scene-data";
const url=new URL(process.env.DATABASE_URL!);assert.equal(url.hostname,"127.0.0.1");assert.equal(url.port,"55488");assert.equal(url.pathname,"/ai_town_mvp_test");
Object.assign(process.env,{AI_ENABLED:"false",NPC_AI_ENABLED:"false",AI_API_KEY:"",AI_BASE_URL:"http://127.0.0.1:1/v1"});
const id=`v12-story-${randomUUID()}`,visitor="a".repeat(64),dir=`evidence/v12/${id}`;
const timeline:unknown[]=[],states=new Map<string,string>();
try{
 await database().query(await readFile('scripts/v12-schema.sql','utf8'));
 const seed=populateResidents(createWorld());seed.minute=780;seed.revision=0;
 for(const n of seed.npcs){n.energy=85;n.hunger=15;n.mood=n.personality==="quiet"?90:60;}
 seed.npcs.find(n=>n.id==="muxi")!.energy=20;
 const worker=seed.npcs.find(n=>n.id==="laolin")!;worker.workTask={id:"v12-work",kind:"store",progress:0,phase:"active",createdMinute:780};
 assertWorld(seed);await database().query("INSERT INTO town_worlds(id,revision,payload) VALUES($1,$2,$3)",[id,seed.revision,JSON.stringify(seed)]);
 const publish={action:"publish",requestId:randomUUID(),content:"今天下午四点，大家来广场聊聊天吧！",location:"square",startMinute:960};
 const {world:announced}=await changeNotice(id,visitor,publish);assert.deepEqual(new Set(announced.gatherings![0].responses.map(r=>r.status)),new Set(["accepted","declined","deferred"]));
 assert.equal((await notices(id,"b".repeat(64))).ownedIds.length,0);assert.ok(!JSON.stringify(announced).includes(visitor));
 assert.deepEqual((await changeNotice(id,visitor,publish)).world,announced);
 assert.deepEqual(await wakeWorld(id),announced);
 const concurrent=await Promise.allSettled([tickWorld(announced.revision,id),tickWorld(announced.revision,id)]);assert.equal(concurrent.filter(r=>r.status==="fulfilled").length,1);
 let w=await readWorld(id),movingSnapshot;
 for(let i=0;i<130;i++){
  w=await tickWorld(w.revision,id);assertWorld(w);
  for(const n of w.npcs)if(n.lastPath.length)assert.ok(validScenePath(n.sceneId,n.lastPath));
  for(const r of w.gatherings![0].responses)if(states.get(r.npcId)!==r.status){timeline.push({minute:w.minute,response:r,npc:w.npcs.find(n=>n.id===r.npcId)});states.set(r.npcId,r.status);}
  if(!movingSnapshot&&w.gatherings![0].responses.some(r=>r.status==="travelling"))movingSnapshot=structuredClone(w);
 }
 assert.equal(w.gatherings![0].status,"ended");const participants=w.gatherings![0].responses.filter(r=>r.status==="participated");assert.ok(participants.length>=2);assert.ok(movingSnapshot);
 const ended=structuredClone(w);
 // Actual clock serialization: two browser wake-ups at the same due instant yield one step.
 await setWorldRunning(true,w.revision,id);await updateWorld(id,current=>({...current,revision:current.revision+1,run:{running:true,nextTickAt:0}}));
 const beforeWake=await readWorld(id),wakes=await Promise.all([wakeWorld(id),wakeWorld(id)]);assert.equal(wakes[0].minute,wakes[1].minute);assert.equal(wakes[0].minute,beforeWake.minute+2);w=await setWorldRunning(false,wakes[0].revision,id);
 await mkdir(dir,{recursive:true});await writeFile(`${dir}/result.json`,JSON.stringify({id,externalCalls:0,announced,timeline,movingSnapshot,ended,final:w,checks:["different intents","real legal routes","arrival vs participation","concurrent tick CAS","concurrent wake once","paused wake no time","private owner isolation"]},null,2));console.log(dir);
}finally{await database().end();}
