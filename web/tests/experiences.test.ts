import {describe,it,expect} from "vitest";
import {createWorld,populateResidents,advanceWorld,assertWorld} from "../src/lib/world";
import {recordExperience,personalMemories,observeEncounters,relationFor} from "../src/lib/experiences";
import {buildMessages,fallbackReply} from "../src/lib/chat-context";
function meet(){const w=populateResidents(createWorld());w.revision=20;w.npcs[0].hunger=0;w.npcs[0].energy=80;w.npcs[1].hunger=0;w.npcs[1].energy=80;return w;}
describe("facts, personal knowledge and opinions",()=>{
  it("records a real encounter once; only participants know; relation points to fact",()=>{
    const w=meet(),e=recordExperience(w,["aqing","aning"],"encounter","test-meet","阿晴与阿宁在广场碰面。")!;
    expect(e.knownBy).toEqual(["aqing","aning"]);expect(personalMemories(w,"aqing")[0].eventId).toBe(e.id);expect(personalMemories(w,"aning")).toHaveLength(1);expect(personalMemories(w,"xiaoyu")).toEqual([]);
    expect(relationFor(w,"aqing","aning")).toMatchObject({familiarity:1,trust:0,lastEventId:e.id});
    expect(recordExperience(w,["aqing","aning"],"encounter","test-meet","重复")).toBeNull();expect(personalMemories(w,"aqing")).toHaveLength(1);assertWorld(w);
  });
  it("rejects distant or cross-scene interaction and respects encounter cooldown",()=>{
    const w=meet();w.npcs[2].position={x:1158,y:324};expect(recordExperience(w,["aqing","xiaoyu"],"encounter","far","不应发生")).toBeNull();
    observeEncounters(w);const count=w.experiences!.facts.length;observeEncounters(w);expect(w.experiences!.facts.length).toBe(count);
    w.npcs[1].sceneId="home_interior";expect(recordExperience(w,["aqing","aning"],"encounter","wrong","不应发生")).toBeNull();
  });
  it("dialogue gets only personal experiences and private player text stays private",()=>{
    const w=meet();recordExperience(w,["aqing","aning"],"encounter","private-test","共同看到广场晨光");
    expect(JSON.stringify(buildMessages(w.npcs[0],w,[],"记得什么"))).toContain("共同看到广场晨光");
    expect(JSON.stringify(buildMessages(w.npcs[2],w,[],"记得什么"))).not.toContain("共同看到广场晨光");
    expect(fallbackReply(w.npcs[0],w,"记得什么")).toContain("亲历");expect(fallbackReply(w.npcs[2],w,"记得什么")).toContain("没有相关");
    const before=structuredClone(w);buildMessages(w.npcs[0],w,[],"私密暗号不公开");expect(w).toEqual(before);expect(JSON.stringify(w.experiences)).not.toContain("私密暗号");
  });
  it("bounds memories and preserves referenced facts after long simulation",()=>{
    let w=meet();for(let i=0;i<400;i++){w=advanceWorld(w);assertWorld(w);}
    for(const list of Object.values(w.experiences!.memories))expect(list.length).toBeLessThanOrEqual(20);
    const corrupt=structuredClone(w);const id=Object.keys(corrupt.experiences!.memories)[0];corrupt.experiences!.memories[id][0].eventId=-1;expect(()=>assertWorld(corrupt)).toThrow();
  },20000);
});
