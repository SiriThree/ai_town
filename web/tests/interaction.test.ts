import {describe,it,expect} from "vitest";
import {interactionTarget,nearbyResidents,busyReason,NOTICE_BOARD} from "../src/lib/interaction";
import {newPlayer,enterPortal} from "../src/lib/player-scene";
import {portalById} from "../src/lib/scene-data";
import {createWorld,advanceWorld} from "../src/lib/world";
describe("local avatar interaction target",()=>{
  it("nearby visible same-scene residents only; never selects a remote or wall-separated NPC",()=>{
    const w=createWorld(),n=w.npcs[0],p={...newPlayer(),position:{x:n.position.x+35,y:n.position.y}};
    expect(nearbyResidents(p,w.npcs).map(n=>n.id)).toContain(n.id);expect(interactionTarget(p,[n])?.id).toBe(n.id);
    expect(nearbyResidents({...p,sceneId:"home_interior"},w.npcs)).toEqual([]);
    expect(nearbyResidents({...p,position:{x:1000,y:360}},w.npcs)).toEqual([]);
  });
  it("one deterministic E target even next to a resident and doorway; does not execute both",()=>{
    const door=portalById("cafe-door"),p={...newPlayer(),position:door.position,facing:"north" as const};
    const n={...createWorld().npcs[0],position:{x:door.position.x+30,y:door.position.y+15}};
    for(let i=0;i<20;i++)expect(interactionTarget(p,[n])?.id).toBe(door.id);
    expect(enterPortal(p,interactionTarget(p,[n])!.id).sceneId).toBe("cafe_interior");
  });
  it("existing street sign reads real logs, and every indoor exit remains a valid target",()=>{
    expect(interactionTarget({...newPlayer(),position:{x:NOTICE_BOARD.x,y:358}},[])?.kind).toBe("notice");
    const p=portalById("home-exit");expect(interactionTarget({...newPlayer(),sceneId:p.source,position:p.position},[])?.id).toBe(p.id);
  });
  it("moving or uninterruptible work gives busy feedback without mutating the task",()=>{
    const w=createWorld();w.npcs[0].hunger=80;const walking=advanceWorld(w),before=structuredClone(walking);
    expect(busyReason(walking.npcs[0],walking)).toContain("赶路");expect(walking).toEqual(before);expect(busyReason(w.npcs[1],w)).toBeNull();
  });
});
