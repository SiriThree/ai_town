import {describe,it,expect} from "vitest";
import {existsSync} from "node:fs";
import {SCENES,PORTALS,INTERIORS,canStand,validScenePath} from "../src/lib/scene-data";
import {findScenePath} from "../src/lib/navigation";
import {TOWN_BUILDINGS} from "../src/lib/town-map";
import {enterPortal,newPlayer,movePlayer} from "../src/lib/player-scene";
describe("all twelve interior contracts",()=>{
  it("every building has one separate room and reciprocal portal with safe spawns",()=>{
    const doors=PORTALS.filter(p=>p.source==="town");expect(doors).toHaveLength(12);expect(new Set(doors.map(p=>p.target)).size).toBe(12);
    for(const b of TOWN_BUILDINGS){const door=doors.find(p=>p.id===b.id+"-door")!;expect(door,b.id).toBeDefined();
      const room=SCENES[door.target],exit=PORTALS.find(p=>p.id===door.reverseId)!;
      expect(existsSync("public"+room.art)).toBe(true);expect(exit.target).toBe("town");expect(exit.reverseId).toBe(door.id);
      for(const p of [door.spawn,...Object.values(door.npcSpawns)])expect(canStand(door.target,p)).toBe(true);
      for(const p of [exit.spawn,...Object.values(exit.npcSpawns)])expect(canStand("town",p),b.id).toBe(true);
      const inside=enterPortal({...newPlayer(),position:door.position},door.id);expect(inside.sceneId).toBe(door.target);
      expect(enterPortal(inside,exit.id).position).toEqual(exit.spawn);
      const path=findScenePath(door.target,door.spawn,{x:480,y:380});expect(validScenePath(door.target,path),b.id).toBe(true);
    }
  });
  it("each room blocks its own walls and furniture while maintaining exit access",()=>{
    for(const door of PORTALS.filter(p=>p.source==="town")){
      const id=door.target as keyof typeof INTERIORS;
      expect(INTERIORS[id].furniture.length).toBeGreaterThanOrEqual(4);
      for(const f of INTERIORS[id].furniture)expect(canStand(id,{x:f.solid.x+f.solid.w/2,y:f.solid.y+f.solid.h/2})).toBe(false);
      let p={...newPlayer(),sceneId:id,position:door.spawn};for(let i=0;i<120;i++)p=movePlayer(p,0,1,.05) as typeof p;
      expect(p.position.y).toBeLessThanOrEqual(503);expect(canStand(id,p.position)).toBe(true);
    }
  });
  it("public/work/service/house layouts have different configurations",()=>{
    const layouts=Object.values(INTERIORS).map(r=>JSON.stringify(r.furniture));expect(new Set(layouts).size).toBe(12);
  });
});
