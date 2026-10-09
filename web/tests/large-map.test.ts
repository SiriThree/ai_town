import {describe,it,expect} from "vitest";
import {findScenePath} from "../src/lib/navigation";
import {canStand,validScenePath,PORTALS} from "../src/lib/scene-data";
import {TOWN_BUILDINGS,NEW_BUILDINGS,BRIDGES,STEPS} from "../src/lib/town-map";
describe("large outdoor map",()=>{
  it("connects all twelve door sites to the original plaza without relocating old sites",()=>{
    expect(TOWN_BUILDINGS).toHaveLength(12);
    for(const b of TOWN_BUILDINGS){const end={x:b.x,y:b.y+17},path=findScenePath("town",{x:620,y:370},end);
      expect(path.length,`unreachable ${b.id}`).toBeGreaterThan(1);expect(validScenePath("town",path),b.id).toBe(true);
    }
    expect(PORTALS.filter(p=>p.source==="town")).toHaveLength(4);
    expect(NEW_BUILDINGS.every(b=>!PORTALS.some(p=>p.id===b.id+"-door"))).toBe(true);
  });
  it("blocks water while allowing both real bridges and stair landings",()=>{
    expect(canStand("town",{x:1870,y:900})).toBe(false);
    for(const b of BRIDGES)expect(validScenePath("town",[{x:1800,y:b.y+40},{x:1950,y:b.y+40}])).toBe(true);
    for(const b of STEPS)expect(validScenePath("town",[{x:b.x+40,y:b.y-10},{x:b.x+40,y:b.y+b.h+10}])).toBe(true);
    expect(findScenePath("town",{x:1870,y:900},{x:620,y:370})).toEqual([]);
  });
});
