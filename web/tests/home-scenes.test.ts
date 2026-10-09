import {completeAction} from "./helpers/advance";
const advanceWorld=(w:import("../src/lib/world").World)=>completeAction(w,"aning");
import {describe,it,expect} from "vitest";
import {assertWorld,createWorld,decide,execute,canExecute,restoreWorld,npcPlace} from "../src/lib/world";
import {SCENES,PORTALS,portalById,HOME_REST,homePath,canStand,validScenePath} from "../src/lib/scene-data";
import {newPlayer,enterPortal,nearbyPortal,restorePlayer,movePlayer,residentScene} from "../src/lib/player-scene";
import {acceptPosition,stillAt,poseAt} from "../src/lib/scene-motion";
import {buildMessages,fallbackReply} from "../src/lib/chat-context";
const tired=()=>{const w=createWorld();Object.assign(w.npcs[1],{hunger:0,energy:8});return w;};

describe("reusable buildings and real home rest",()=>{
  it("all paired portals have matching source/reverse relationships and safe distinct spawns",()=>{
    for(const p of PORTALS){const reverse=portalById(p.reverseId);expect(reverse.reverseId).toBe(p.id);expect(reverse.source).toBe(p.target);expect(reverse.target).toBe(p.source);
      expect(SCENES[p.source].portals).toContain(p);expect(canStand(p.target,p.spawn)).toBe(true);
      for(const point of Object.values(p.npcSpawns))expect(canStand(p.target,point)).toBe(true);
    }
  });
  it("players use the same portal definitions without entering the other building or remotely teleporting",()=>{
    for(const p of PORTALS){const player={...newPlayer(),sceneId:p.source,position:p.position};expect(nearbyPortal(player)?.id).toBe(p.id);
      const inside=enterPortal(player,p.id);expect(inside.sceneId).toBe(p.target);expect(inside.position).toEqual(p.spawn);
      expect(enterPortal(player,p.reverseId)).toBe(player);expect(enterPortal(newPlayer(),p.id)).toEqual(newPlayer());
      expect(restorePlayer(inside)).toEqual(inside);
    }
    const corrupt={...newPlayer(),sceneId:"home_interior",position:{x:290,y:260}};
    expect(restorePlayer(corrupt)).toMatchObject({sceneId:"home_interior",position:{x:480,y:486}});
  });
  it("furniture collision blocks feet, while both residents' authored bed and exit routes are walkable",()=>{
    for(const id of ["aqing","aning"] as const)for(const to of ["activity","exit"] as const)expect(validScenePath("home_interior",homePath(id,to))).toBe(true);
    expect(canStand("home_interior",{x:290,y:280})).toBe(false);
    let player={...newPlayer(),sceneId:"home_interior" as const,position:{x:370,y:300}};
    for(let i=0;i<100;i++)player=movePlayer(player,-1,0,.05) as typeof player;
    expect(player.position.x).toBeGreaterThanOrEqual(353);expect(player.position.y).toBe(300);
  });
  it("energy changes the same resident's next choice; entry, interior walk and rest are separate saved steps",()=>{
    const initial=tired(),n=initial.npcs[1];expect(decide(n,initial).action).toEqual({kind:"move",to:"home"});
    expect(decide({...n,energy:80},initial).action).toEqual({kind:"read"});
    expect(canExecute(n,{kind:"enter"},initial)).toBe(false);
    const door=advanceWorld(initial),entered=advanceWorld(door),bed=advanceWorld(entered),rested=advanceWorld(bed);
    expect(door.npcs[1]).toMatchObject({sceneId:"town",location:"home",position:{x:234,y:324}});
    expect(door.npcs[1].lastPath.at(-1)).toEqual(door.npcs[1].position);expect(canExecute(door.npcs[1],{kind:"rest"},door)).toBe(false);
    expect(entered.npcs[1]).toMatchObject({sceneId:"home_interior",position:{x:500,y:486},lastPath:[]});
    expect(canExecute(entered.npcs[1],{kind:"rest"},entered)).toBe(false);
    expect(bed.npcs[1].lastPath.at(-1)).toEqual(HOME_REST.aning.position);expect(bed.npcs[1].position).toEqual(HOME_REST.aning.position);
    expect(rested.npcs[1]).toMatchObject({action:"在床边休息",facing:"east"});
    for(const w of [initial,door,entered,bed,rested])expect(()=>assertWorld(w)).not.toThrow();
    expect(canExecute({...door.npcs[1],position:portalById("cafe-door").position},{kind:"enter"},door)).toBe(false);
  });
  it("recovery, not a fixed sequence, determines resting or leaving through the indoor path and reverse portal",()=>{
    let w=tired();for(let i=0;i<4;i++)w=advanceWorld(w);
    const n=w.npcs[1];expect(decide(n,w).action.kind).toBe("rest");
    expect(decide({...n,energy:80},w).action).toEqual({kind:"walk-inside",to:"exit"});
    expect(decide({...n,hunger:90,energy:40},w).action).toEqual({kind:"walk-inside",to:"exit"});
    const recovered=advanceWorld(w);expect(recovered.npcs[1].energy).toBeGreaterThan(65);
    const exitDoor=advanceWorld(recovered);expect(exitDoor.npcs[1].lastPath.at(-1)).toEqual(exitDoor.npcs[1].position);expect(exitDoor.npcs[1].sceneId).toBe("home_interior");
    const outside=advanceWorld(exitDoor);expect(outside.npcs[1]).toMatchObject({sceneId:"town",location:"home",position:{x:234,y:324},lastPath:[]});
    const away=advanceWorld(outside);expect(away.npcs[1].location).toBe("square");expect(away.npcs[1].lastPath.at(-1)).toEqual(away.npcs[1].position);
    expect(canExecute(n,{kind:"exit"},w)).toBe(false);expect(()=>execute(n,{action:{kind:"exit"},reason:"bad"},w)).toThrow();
  });
  it("home routes animate only in their scene; a new step preserves remaining real path and idle bed facing",()=>{
    const entered=advanceWorld(advanceWorld(tired())),bed=advanceWorld(entered),n=entered.npcs[1];
    const motion=acceptPosition(stillAt(n.position,"north",n.sceneId),{...bed.npcs[1],lastPath:homePath("aning","activity")},0);
    expect(poseAt(motion,100).moving).toBe(true);
    const rest=advanceWorld(bed).npcs[1];expect(poseAt(acceptPosition(motion,rest,10000),10000).facing).toBe("east");
    expect(poseAt(acceptPosition(motion,rest,100),10000).facing).toBe("east");
    const reverse={...rest,position:n.position,lastPath:homePath("aning","exit")};const returning=acceptPosition(motion,reverse,100);
    expect(returning.points).toContainEqual(HOME_REST.aning.position);expect(poseAt(returning,20000).position).toEqual(n.position);
    const transition=acceptPosition(motion,{...rest,sceneId:"town",position:{x:234,y:324},lastPath:[]},100);
    expect(transition.points).toHaveLength(1);expect(poseAt(transition,100).moving).toBe(false);
  });
  it("v1/v2 porch saves remain outdoors and unchanged on read; no location-to-scene guessing",()=>{
    for(const version of [1,2]){const legacy=JSON.parse(JSON.stringify(tired()));legacy.schemaVersion=version;legacy.revision=41;legacy.minute=900;
      Object.assign(legacy.npcs[1],{location:"home",position:{x:242,y:306},action:"在门廊休息"});if(version===1)for(const n of legacy.npcs)delete n.sceneId;
      const before=structuredClone(legacy),restored=restoreWorld(legacy);expect(legacy).toEqual(before);expect(restored.npcs[1]).toMatchObject({sceneId:"town",position:{x:242,y:306}});
      expect(restored.revision).toBe(41);expect(advanceWorld(restored).npcs[1]).toMatchObject({sceneId:"town",position:{x:234,y:324}});
    }
  });
  it("rejects furniture centres, mismatched business location, diagonal indoor and cross-scene paths",()=>{
    const w=advanceWorld(advanceWorld(advanceWorld(tired())));
    for(const patch of [{location:"cafe"},{position:{x:670,y:260}},{lastPath:[{x:500,y:486},{x:588,y:300}]},{lastPath:[{x:234,y:324},{x:588,y:300}]}]){
      const bad=structuredClone(w);Object.assign(bad.npcs[1],patch);expect(()=>assertWorld(bad)).toThrow();
    }
  });
  it("both existing residents can independently choose home and recover during sustained needs-driven simulation",()=>{
    let w=createWorld();const recovered=new Set<string>();
    for(let i=0;i<300;i++){w=advanceWorld(w);assertWorld(w);for(const n of w.npcs)if(n.action==="在床边休息")recovered.add(n.id);}
    expect(recovered).toEqual(new Set(["aqing","aning"]));
  });
  it("home scene, action and position are used in both model facts and fallback, without mutating world",()=>{
    let w=tired();for(let i=0;i<4;i++)w=advanceWorld(w);const before=structuredClone(w),n=w.npcs[1];
    expect(npcPlace(n,w)).toBe("暖灯小屋 · 室内");expect(residentScene(n)).toBe("home_interior");
    const facts=JSON.parse(buildMessages(n,w,[],"现在在哪")[0].content.split("世界事实：\n")[1]);
    expect(facts).toMatchObject({sceneId:"home_interior",position:HOME_REST.aning.position,action:"在床边休息"});
    expect(fallbackReply(n,w,"现在在哪")).toContain("暖灯小屋 · 室内");expect(w).toEqual(before);
  });
});
