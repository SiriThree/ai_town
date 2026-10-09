import { describe,it,expect } from "vitest";
import { acceptPosition,poseAt,stillAt } from "../src/lib/scene-motion";
import { createWorld,advanceWorld,execute } from "../src/lib/world";

describe("committed route presentation",()=>{
  const world=createWorld(),start=world.npcs[0],next=advanceWorld(world).npcs[0];
  it("opens at the saved endpoint without replaying an old lastPath",()=>{
    const m=stillAt(next.position);expect(acceptPosition(m,next,0)).toBe(m);expect(poseAt(m,0)).toMatchObject({position:next.position,moving:false,frame:0});
  });
  it("walks only along the saved corridor, turns, cycles frames and lands exactly",()=>{
    const m=acceptPosition(stillAt(start.position),next,100),facing=new Set(),frames=new Set();
    for(let t=100;t<100+m.duration;t+=20){const p=poseAt(m,t);facing.add(p.facing);frames.add(p.frame);expect(p.position.y===358||p.position.x===442||p.position.x===next.position.x).toBe(true);expect(p.position.x%2).toBe(0);}
    expect([...facing]).toEqual(["north","east"]); // last segment also north
    expect([...frames].sort()).toEqual([0,1,2]);expect(poseAt(m,100+m.duration)).toMatchObject({position:next.position,moving:false,frame:0,facing:"north"});
  });
  it("ignores duplicate polls and state-only mutations during a walk",()=>{
    const m=acceptPosition(stillAt(start.position),next,0);expect(acceptPosition(m,next,500)).toBe(m);expect(acceptPosition(m,{...next,lastPath:[]},600)).toBe(m);
  });
  it("splices only remaining committed segments when a new move arrives early",()=>{
    const m=acceptPosition(stillAt(start.position),next,0);
    const returnNpc=execute(next,{action:{kind:"move",to:"home"},reason:"test"},world);
    const joined=acceptPosition(m,returnNpc,500);
    expect(poseAt(joined,500).position).toEqual(poseAt(m,500).position);
    expect(joined.points).toContainEqual(next.position);expect(joined.duration).toBeLessThanOrEqual(3000);
    expect(poseAt(joined,4000)).toMatchObject({position:returnNpc.position,moving:false});
  });
  it("snaps to the latest saved endpoint if a path is missing, stale or illegal",()=>{
    for(const path of [[],[{x:1,y:1}],next.lastPath.map(p=>({...p,x:p.x+3}))])expect(poseAt(acceptPosition(stillAt(start.position),{...next,lastPath:path},0),0)).toMatchObject({position:next.position,moving:false});
  });
  it("finishes a committed walk during pause and after tab suspension, with no replay",()=>{
    const m=acceptPosition(stillAt(start.position),next,0);expect(poseAt(m,100).moving).toBe(true);expect(poseAt(m,60000)).toMatchObject({position:next.position,moving:false,frame:0});
  });
  it("supports west and south direction from saved returning paths",()=>{
    const npc=execute(next,{action:{kind:"move",to:"square"},reason:"test"},world),m=acceptPosition(stillAt(next.position),npc,0),directions=new Set();
    for(let t=0;t<m.duration;t+=10)directions.add(poseAt(m,t).facing);expect(directions).toEqual(new Set(["south","west"]));
  });
});
