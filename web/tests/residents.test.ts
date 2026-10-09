import {describe,it,expect} from "vitest";
import {createWorld,populateResidents,advanceWorld,assertWorld,decide,restoreWorld} from "../src/lib/world";
import {canStand,buildingAt,validScenePath} from "../src/lib/scene-data";
describe("six residents without overwriting old citizens",()=>{
  it("adds only missing IDs and preserves the full old snapshot",()=>{
    const old=advanceWorld(createWorld()),before=structuredClone(old),next=populateResidents(old);
    expect(old).toEqual(before);expect(next.npcs.slice(0,2)).toEqual(before.npcs);expect(next.events).toEqual(before.events);expect(next.minute).toBe(before.minute);
    expect(next.npcs).toHaveLength(6);expect(populateResidents(next)).toBe(next);expect(restoreWorld(next)).toEqual(next);
    for(const n of next.npcs.slice(2)){expect(buildingAt(n.homeId!)).toBeDefined();if(n.job)expect(buildingAt(n.job)).toBeDefined();expect(canStand(n.sceneId,n.position)).toBe(true);}
  });
  it("same needs produce different real targets and fatigue overrides preferences",()=>{
    const w=populateResidents(createWorld());for(const n of w.npcs.slice(2))Object.assign(n,{hunger:0,energy:90});
    expect(decide(w.npcs[2],w).action).toEqual({kind:"move",to:"cafe"});
    expect(decide(w.npcs[3],w).action).toEqual({kind:"move",to:"store"});
    expect(decide(w.npcs[4],w).action).toEqual({kind:"move",to:"reed"});
    expect(decide({...w.npcs[2],energy:8},w).action).toEqual({kind:"move",to:"rose"});
  });
  it("all six sustain legal scene paths and restore for 1200 seconds",()=>{
    let w=populateResidents(createWorld());const visits=new Map<string,Set<string>>();
    for(let i=0;i<1200;i++){w=advanceWorld(w);assertWorld(w);expect(restoreWorld(JSON.parse(JSON.stringify(w)))).toEqual(w);
      for(const n of w.npcs){expect(canStand(n.sceneId,n.position),n.id+" "+n.action).toBe(true);if(n.lastPath.length)expect(validScenePath(n.sceneId,n.lastPath),n.id).toBe(true);
        if(!visits.has(n.id))visits.set(n.id,new Set());visits.get(n.id)!.add(n.sceneId);}
      expect(new Set(w.events.map(e=>e.id)).size).toBe(w.events.length);
    }
    for(const n of w.npcs.slice(2)){expect(visits.get(n.id)!.has(buildingAt(n.homeId!)!.sceneId),n.id+" home").toBe(true);expect(visits.get(n.id)!.has("cafe_interior"),n.id+" cafe").toBe(true);}
  },20000);
});
