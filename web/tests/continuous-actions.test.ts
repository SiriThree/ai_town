import {describe,it,expect} from "vitest";
import {advanceWorld,advanceOnClock,assertWorld,createWorld,populateResidents,restoreWorld,positionAt,giveFood} from "../src/lib/world";
import {STEP_MS,WALK_SPEED,pathLength,pathPoint} from "../src/lib/action-time";
import {canStand} from "../src/lib/scene-data";
import {acceptPosition,poseAt,stillAt} from "../src/lib/scene-motion";
import {until} from "./helpers/advance";
describe("authoritative continuous actions",()=>{
  it("distance controls duration; both routes travel at 80 units/second, not within one tick",()=>{
    const short=createWorld();short.npcs[0].hunger=80;
    const long=populateResidents(createWorld());Object.assign(long.npcs[4],{sceneId:"town",location:"square",hunger:0,energy:90});
    const a=advanceWorld(short).npcs[0],b=advanceWorld(long).npcs[4];
    for(const n of [a,b]){expect(n.ongoing).toBeDefined();expect(n.location).toBe("square");expect(n.ongoing!.durationMs).toBeCloseTo(pathLength(n.ongoing!.path)/WALK_SPEED*1000);expect(n.position).toEqual(pathPoint(n.ongoing!.path,WALK_SPEED));}
    expect(b.ongoing!.durationMs).toBeGreaterThan(a.ongoing!.durationMs*2);
  });
  it("ordinary checks and food do not replace a route; no premature entry or duplicate completion",()=>{
    let w=createWorld();w.npcs[0].hunger=85;w=advanceWorld(w);const id=w.npcs[0].ongoing!.id;
    w=giveFood(w,"aqing");const fed=w.npcs[0].hunger;
    while(w.npcs[0].ongoing){expect(w.npcs[0].ongoing.id).toBe(id);expect(w.npcs[0].sceneId).toBe("town");expect(w.npcs[0].location).toBe("square");w=advanceWorld(w);assertWorld(w);}
    expect(w.npcs[0].position).toEqual(positionAt("cafe","aqing"));expect(w.npcs[0].hunger).toBe(fed);
    expect(w.events.filter(e=>e.npcId==="aqing"&&e.text.includes("来到麦香"))).toHaveLength(1);
    expect(advanceWorld(w).npcs[0].ongoing?.decision.action).toEqual({kind:"move",to:"square"});
  });
  it("saved partial actions restore exactly; pause consumes no time and delayed wake cannot catch up indefinitely",()=>{
    let w=createWorld();w.npcs[0].hunger=80;w=advanceWorld(w);const restored=restoreWorld(JSON.parse(JSON.stringify(w)));expect(restored).toEqual(w);
    expect(advanceOnClock(w,1000000,true)).toBe(w);
    w.run={running:true,nextTickAt:5000};const next=advanceOnClock(w,5000,true);
    expect(next.npcs[0].ongoing!.elapsedMs-w.npcs[0].ongoing!.elapsedMs).toBe(STEP_MS);
    expect(advanceOnClock(next,5000,true)).toBe(next);
    const late=advanceOnClock(next,99999999,true);expect(late.minute-next.minute).toBe(2);
  });
  it("needs settle only after eating/resting finish, with valid indoor crossings",()=>{
    let w=createWorld();w.npcs[0].hunger=80;w=until(w,w=>w.npcs[0].sceneId==="cafe_interior");
    const hunger=w.npcs[0].hunger;w=advanceWorld(w);expect(w.npcs[0].hunger).toBe(hunger);expect(w.npcs[0].ongoing?.decision.action.kind).toBe("eat");
    w=until(w,w=>!w.npcs[0].ongoing);expect(w.npcs[0].hunger).toBeLessThan(hunger-40);expect(w.events.filter(e=>e.npcId==="aqing"&&e.text.endsWith("享用餐点"))).toHaveLength(1);
  });
  it("slow frames sample elapsed time directly without a per-frame movement cap or fake detours",()=>{
    let w=createWorld();w.npcs[0].hunger=80;const start=w.npcs[0];w=advanceWorld(w);
    const m=acceptPosition(stillAt(start.position),w.npcs[0],100);
    expect(m.duration).toBe(1000);
    const sparse=[100,430,920,1100].map(t=>poseAt(m,t));expect(sparse.at(-1)!.position).toEqual(w.npcs[0].position);
    expect(sparse.every(p=>canStand("town",p.position))).toBe(true);
    expect(poseAt(m,60000).moving).toBe(false);
  });
  it("rejects corrupted progress instead of resetting an existing world",()=>{
    const w=createWorld();w.npcs[0].hunger=80;const next=advanceWorld(w);
    for(const patch of [{elapsedMs:Infinity},{durationMs:1},{sceneId:"cafe_interior"},{path:[{x:0,y:0},{x:900,y:500}]}]){
      const bad=structuredClone(next);Object.assign(bad.npcs[0].ongoing!,patch);expect(()=>assertWorld(bad)).toThrow();
    }
  });
});
