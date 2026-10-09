import {describe,it,expect} from "vitest";
import {advanceWorld,assertWorld,createWorld,decide,execute,canExecute,giveFood,restoreWorld,type World} from "../src/lib/world";
import {canStand,nearDoor,npcCafeSpawn} from "../src/lib/scene-data";
import {acceptPosition,stillAt,poseAt} from "../src/lib/scene-motion";
import {buildMessages,fallbackReply} from "../src/lib/chat-context";

describe("authoritative cafe membership",()=>{
  it("walks to the outdoor portal before entering; entry, eat and exit are separate committed steps",()=>{
    const initial=createWorld(),door=advanceWorld(initial),inside=advanceWorld(door),ate=advanceWorld(inside),outside=advanceWorld(ate),away=advanceWorld(outside);
    expect(door.npcs[0]).toMatchObject({sceneId:"town",location:"cafe",position:{x:754,y:324}});
    expect(door.npcs[0].lastPath[0]).toEqual(initial.npcs[0].position);
    expect(nearDoor("town",door.npcs[0].position)).toBe(true);
    expect(inside.npcs[0]).toMatchObject({sceneId:"cafe_interior",position:npcCafeSpawn("aqing"),lastPath:[]});
    expect(ate.npcs[0].hunger).toBe(33);expect(ate.npcs[0].action).toBe("享用餐点");
    expect(outside.npcs[0]).toMatchObject({sceneId:"town",location:"cafe",lastPath:[]});
    expect(away.npcs[0].location).toBe("square");
    expect(away.npcs[0].lastPath[0]).toEqual(outside.npcs[0].position);
    expect(inside.events.at(-2)?.text).toContain("进入");expect(outside.events.at(-2)?.text).toContain("离开");
  });
  it("legal portal and needs, not a timer script, control entry and exit",()=>{
    const w=createWorld();expect(canExecute(w.npcs[0],{kind:"enter"},w)).toBe(false);
    const door=advanceWorld(w);expect(canExecute(door.npcs[0],{kind:"eat"},door)).toBe(false);
    expect(decide(door.npcs[0],door).action.kind).toBe("enter");
    const fed=giveFood(door,"aqing");expect(decide(fed.npcs[0],fed).action).toEqual({kind:"move",to:"square"});
    const inside=advanceWorld(door),n=inside.npcs[0];
    expect(decide(n,inside).action.kind).toBe("eat");
    expect(decide({...n,hunger:20},inside).action.kind).toBe("exit");
    expect(decide({...n,hunger:20,energy:10},inside).action.kind).toBe("exit");
    expect(canExecute({...n,position:{x:480,y:350}},{kind:"exit"},inside)).toBe(false);
    expect(()=>execute({...n,position:{x:480,y:350}},{action:{kind:"exit"},reason:"invalid"},inside)).toThrow();
  });
  it("both residents' standing areas use the real cafe floor and exit geometry",()=>{
    for(const id of ["aqing","aning"]){const p=npcCafeSpawn(id);expect(canStand("cafe_interior",p)).toBe(true);expect(nearDoor("cafe_interior",p)).toBe(true);}
    expect(npcCafeSpawn("aqing")).not.toEqual(npcCafeSpawn("aning"));
  });
  it("legacy cafe means outdoors; reading neither rewrites nor resets its position, state or history",()=>{
    const legacy=JSON.parse(JSON.stringify(createWorld()));legacy.schemaVersion=1;legacy.revision=52;legacy.minute=940;
    for(const n of legacy.npcs)delete n.sceneId;
    Object.assign(legacy.npcs[0],{location:"cafe",position:{x:746,y:306},hunger:80,action:"享用餐点"});
    const before=structuredClone(legacy),restored=restoreWorld(legacy);
    expect(legacy).toEqual(before);expect(restored.npcs[0]).toEqual({...before.npcs[0],sceneId:"town"});
    expect(restored.revision).toBe(52);expect(restored.minute).toBe(940);
    expect(decide(restored.npcs[0],restored).action).toEqual({kind:"move",to:"cafe"});
    expect(advanceWorld(restored).npcs[0].sceneId).toBe("town");
    expect(()=>restoreWorld({...legacy,schemaVersion:77})).toThrow();
  });
  it("rejects unknown scenes, wrong scene/location pairs and cross-scene paths",()=>{
    const w=advanceWorld(advanceWorld(createWorld()));
    for(const patch of [{sceneId:"secret"},{location:"square"},{position:{x:320,y:340}},{lastPath:[{x:754,y:324},{x:460,y:486}]}]){
      const bad=structuredClone(w);Object.assign(bad.npcs[0],patch);expect(()=>assertWorld(bad)).toThrow();
    }
  });
  it("a scene transition cancels unfinished presentation without interpolating scene coordinate systems",()=>{
    const start=createWorld(),door=advanceWorld(start),inside=advanceWorld(door);
    const walking=acceptPosition(stillAt(start.npcs[0].position),door.npcs[0],0);
    expect(poseAt(walking,100).moving).toBe(true);
    const transitioned=acceptPosition(walking,inside.npcs[0],100);
    expect(transitioned.sceneId).toBe("cafe_interior");expect(transitioned.points).toEqual([inside.npcs[0].position]);
    expect(poseAt(transitioned,100).moving).toBe(false);
  });
  it("current indoor/outdoor facts override historical location without altering model transport",()=>{
    const door=advanceWorld(createWorld()),inside=advanceWorld(door);
    expect(fallbackReply(door.npcs[0],door,"现在在哪")).toContain("室外门口");
    expect(fallbackReply(inside.npcs[0],inside,"现在在哪")).toContain("室内");
    const facts=JSON.parse(buildMessages(inside.npcs[0],inside,[],"现在在哪")[0].content.split("世界事实：\n")[1]);
    expect(facts.sceneId).toBe("cafe_interior");expect(facts.position).toEqual(inside.npcs[0].position);
  });
  it("long automatic-equivalent runs keep one identity and valid state, including both residents crossing",()=>{
    let w:World=createWorld();const entered=new Set<string>();
    for(let i=0;i<300;i++){w=advanceWorld(w);assertWorld(w);for(const n of w.npcs)if(n.sceneId==="cafe_interior")entered.add(n.id);}
    expect(entered).toEqual(new Set(["aqing","aning"]));expect(w.npcs).toHaveLength(2);
  });
});
