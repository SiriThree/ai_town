import {completeAction} from "./helpers/advance";
import {describe,it,expect} from "vitest";
import {createWorld,populateResidents,advanceWorld,assertWorld,decide,restoreWorld,canExecute} from "../src/lib/world";
import {prepareWork,workPoint,settleWork} from "../src/lib/work";
import {personalMemories,relationFor} from "../src/lib/experiences";
import {canTalk} from "../src/lib/social";
import {fallbackReply,buildMessages} from "../src/lib/chat-context";
const fixture=()=>{const w=populateResidents(createWorld());prepareWork(w);for(const n of w.npcs.slice(2,4))Object.assign(n,{sceneId:`${n.job}_interior`,location:n.job,position:workPoint(n),hunger:0,energy:90,lastPath:[]});return w;};
describe("persistent real work",()=>{
  it("produces two distinct results only after two legal work actions",()=>{
    let w=fixture();expect(canExecute(w.npcs[0],{kind:"work"},w)).toBe(false);
    w=completeAction(w,"xiaoyu");expect(w.workOutputs).toBeUndefined();expect(w.npcs[2].workTask?.progress).toBe(1);
    w=completeAction(w,"xiaoyu");assertWorld(w);expect(w.workOutputs).toEqual({cafe:1,store:1});const saved=structuredClone(w);settleWork(w);expect(w).toEqual(saved);
    w=completeAction(w,"xiaoyu");expect(w.workOutputs).toEqual({cafe:1,store:1});expect(restoreWorld(JSON.parse(JSON.stringify(w)))).toEqual(w);
  });
  it("fatigue suspends unfinished work, resting resumes the same ID and progress",()=>{
    let w=completeAction(fixture(),"xiaoyu");const id=w.npcs[2].workTask!.id;w.npcs[2].energy=20;
    expect(decide(w.npcs[2],w).action).toEqual({kind:"walk-inside",to:"exit"});
    let sawPause=false,sawHome=false,completed=false;
    for(let i=0;i<500;i++){w=completeAction(w,"xiaoyu");assertWorld(w);const n=w.npcs[2];if(n.workTask?.id!==id)break;
      sawPause ||= n.workTask.phase==="paused";sawHome ||= n.sceneId==="rose_interior";
      if(n.workTask.phase==="completed"){expect(n.workTask.progress).toBe(2);completed=true;break;}
      expect(n.workTask.progress).toBe(1);
    }
    expect([sawPause,sawHome,completed]).toEqual([true,true,true]);
  });
  it("actual cooperation creates facts, mutual knowledge, trust and later dialogue",()=>{
    let w=fixture();w.npcs[2].workTask!.progress=1;
    Object.assign(w.npcs[5],{sceneId:"cafe_interior",location:"cafe",position:{x:520,y:320},hunger:0,energy:90,lastPath:[]});
    w=completeAction(w,"xiaoyu");assertWorld(w);const fact=w.experiences!.facts.find(f=>f.kind==="work"&&f.participants.includes("xiaoman"))!;
    expect(canTalk(w.npcs[2],w.npcs[5],w)).toBe(false);expect(fact.result).toContain("产出 +1");expect(fact.participants).toEqual(["xiaoyu","xiaoman"]);
    expect(relationFor(w,"xiaoyu","xiaoman")!.trust).toBeGreaterThanOrEqual(2);
    for(const id of ["xiaoyu","xiaoman"])expect(personalMemories(w,id).some(m=>m.eventId===fact.id)).toBe(true);
    expect(personalMemories(w,"muxi").some(m=>m.eventId===fact.id)).toBe(false);
    expect(fallbackReply(w.npcs[5],w,"记得什么")).toContain("协助核对");expect(JSON.stringify(buildMessages(w.npcs[2],w,[],"记得什么"))).toContain(fact.result);
  });
  it("keeps legal bounded facts and exactly-once outputs through 1440 steps",()=>{
    let w=populateResidents(createWorld());let cafe=0,store=0;const tasks=new Set<string>();
    for(let i=0;i<1440;i++){w=advanceWorld(w);assertWorld(w);for(const r of w.workHistory??[])if(!tasks.has(r.taskId)){tasks.add(r.taskId);if(r.kind==="cafe")cafe++;else store++;}}
    expect(w.workOutputs).toEqual({cafe,store});expect(cafe).toBeGreaterThan(10);expect(store).toBeGreaterThan(10);expect(w.conversations!.length).toBeLessThanOrEqual(30);
  },30000);
});
