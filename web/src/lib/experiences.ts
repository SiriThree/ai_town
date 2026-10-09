import type {World,Npc,TownEvent} from "./world";
export type ExperienceEvent=TownEvent&{kind:"encounter"|"conversation"|"work";key:string;sceneId:Npc["sceneId"];participants:string[];knownBy:string[];visibility:"public";result:string};
export type Memory={eventId:number;minute:number;summary:string;people:string[];sceneId:Npc["sceneId"];importance:number;opinion:string};
export type Relation={a:string;b:string;familiarity:number;trust:number;lastEventId:number;lastMinute:number};
export type Experiences={facts:ExperienceEvent[];memories:Record<string,Memory[]>;relations:Relation[]};
export const emptyExperiences=():Experiences=>({facts:[],memories:{},relations:[]});
export function relationFor(world:World,a:string,b:string){return world.experiences?.relations.find(r=>r.a===[a,b].sort()[0]&&r.b===[a,b].sort()[1]);}
export function personalMemories(world:World,id:string){return (world.experiences?.memories[id]??[]).slice(-5);}
// Called only inside a world mutation, after physical participation has been validated.
export function recordExperience(world:World,ids:string[],kind:ExperienceEvent["kind"],key:string,result:string):ExperienceEvent|null {
  const people=ids.map(id=>world.npcs.find(n=>n.id===id));
  if(people.some(n=>!n)||new Set(ids).size!==ids.length||!people.length)return null;
  const present=people as Npc[],first=present[0];
  if(present.some(n=>n.sceneId!==first.sceneId||Math.hypot(n.position.x-first.position.x,n.position.y-first.position.y)>110))return null;
  const data=world.experiences??=emptyExperiences();if(data.facts.some(e=>e.key===key))return null;
  const e:ExperienceEvent={id:world.revision*1000+100+data.facts.filter(e=>e.minute===world.minute&&e.id>=world.revision*1000).length,
    minute:world.minute,npcId:first.id,kind,key,sceneId:first.sceneId,participants:[...ids],knownBy:[...ids],visibility:"public",result,
    text:result,reason:"由后台根据实际在场、行动和执行结果确认；主观看法不改变世界事实。"};
  data.facts.push(e);world.events.push(e);
  for(const n of present){const memory:Memory={eventId:e.id,minute:e.minute,summary:result,people:ids.filter(id=>id!==n.id),sceneId:e.sceneId,importance:kind==="work"?3:2,
    opinion:present.length===1?"我的感受：完成手边的事情让我踏实；这不代表其他居民的看法。":n.personality==="outgoing"?"我的感受：和邻居一起经历日常，让我觉得亲近。":"我的感受：我记下了这次经历，想再慢慢了解对方。"};
    data.memories[n.id]=[...(data.memories[n.id]??[]),memory].slice(-20);}
  for(let i=0;i<ids.length;i++)for(let j=i+1;j<ids.length;j++){
    const [a,b]=[ids[i],ids[j]].sort();let r=relationFor(world,a,b);
    if(!r){r={a,b,familiarity:0,trust:0,lastEventId:e.id,lastMinute:e.minute};data.relations.push(r);}
    r.familiarity=Math.min(100,r.familiarity+(kind==="work"?3:1));r.trust=Math.min(100,r.trust+(kind==="work"?2:kind==="conversation"?1:0));r.lastEventId=e.id;r.lastMinute=e.minute;
  }
  // Keep facts referenced by current memories/relationships even after the public log scrolls away.
  const references=new Set([...Object.values(data.memories).flat().map(m=>m.eventId),...data.relations.map(r=>r.lastEventId),...(world.conversations??[]).map(c=>c.eventId),...(world.workHistory??[]).map(r=>r.eventId)]);
  data.facts=data.facts.filter((f,i)=>i>=data.facts.length-200||references.has(f.id));return e;
}
export function observeEncounters(world:World){
  if(!world.rosterVersion)return;
  const used=new Set<string>((world.experiences?.facts??[]).filter(e=>e.id>=world.revision*1000&&e.id<(world.revision+1)*1000).flatMap(e=>e.participants));
  for(const a of world.npcs)for(const b of world.npcs){
    if(a.id>=b.id||used.has(a.id)||used.has(b.id)||a.sceneId!==b.sceneId||a.lastPath.length||b.lastPath.length||a.energy<25||b.energy<25||a.hunger>=65||b.hunger>=65)continue;
    if(Math.hypot(a.position.x-b.position.x,a.position.y-b.position.y)>100)continue;
    const relation=relationFor(world,a.id,b.id);if(relation&&world.minute-relation.lastMinute<90)continue;
    const place=world.locations.find(l=>l.id===a.location)?.name??a.sceneId;
    if(recordExperience(world,[a.id,b.id],"encounter",`encounter:${world.revision}:${a.id}:${b.id}`,`${a.name}与${b.name}在${place}碰面。`)){used.add(a.id);used.add(b.id);}
  }
}
export function assertExperiences(world:World){
  const data=world.experiences;if(!data)return;
  if(!Array.isArray(data.facts)||!Array.isArray(data.relations)||typeof data.memories!=="object")throw new Error("经历存档无效");
  const ids=new Set(world.npcs.map(n=>n.id)),facts=new Map(data.facts.map(f=>[f.id,f]));
  if(facts.size!==data.facts.length||new Set(data.facts.map(f=>f.key)).size!==data.facts.length)throw new Error("重复经历事件");
  for(const f of data.facts)if(f.visibility!=="public"||!f.participants.length||f.participants.some(id=>!ids.has(id))||f.knownBy.some(id=>!f.participants.includes(id)))throw new Error("事件参与者无效");
  for(const [id,list]of Object.entries(data.memories))if(!ids.has(id)||list.length>20||list.some(m=>!facts.get(m.eventId)?.knownBy.includes(id)))throw new Error("记忆缺少合法知情来源");
  for(const r of data.relations)if(!ids.has(r.a)||!ids.has(r.b)||!facts.get(r.lastEventId)?.participants.includes(r.a)||!facts.get(r.lastEventId)?.participants.includes(r.b)||[r.familiarity,r.trust].some(n=>!Number.isFinite(n)||n<0||n>100))throw new Error("关系缺少事件来源");
}
