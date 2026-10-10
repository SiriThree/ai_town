import {describe,it,expect} from "vitest";
import {createHash} from "node:crypto";
import {SCENES,PORTALS,canStand} from "../src/lib/scene-data";
import {STONE_APPROACH} from "../src/lib/town-map";
import {SLICE_TREES,SLICE_FLOWERS,STREET_PROPS,GARDEN_EDGES,SHORE_ROCKS,COURTYARD_FENCES} from "../src/lib/town-dressing";
describe("visual slice preserves the saved world's physical contract",()=>{
  it("preserves all V9.4 geometry and portals apart from additive V10.4 Stone approach floor",()=>{
    const geometry={scenes:Object.fromEntries(Object.entries(SCENES).map(([id,s])=>[id,{size:s.size,walkable:id==="town"?s.walkable.filter(b=>!STONE_APPROACH.includes(b)):s.walkable,obstacles:s.obstacles}])),portals:PORTALS};
    expect(createHash("sha256").update(JSON.stringify(geometry)).digest("hex")).toBe("05d093822d2451f9021dc6f43fb151a97c8dacea8a9065d692e4c6cfceb33e16");
  });
  it("never dresses a traversable point with a tree, solid prop or planted boundary",()=>{
    for(const f of COURTYARD_FENCES)for(let d=0;d<=f.length;d+=2)expect(canStand("town",{x:f.x+(f.vertical?0:d),y:f.y+(f.vertical?d:0)}),"yard fence").toBe(false);
    for(const [x,y,w]of SHORE_ROCKS)for(const dx of [-w,0,w])expect(canStand("town",{x:x+dx,y}),`shore ${x},${y}`).toBe(false);
    for(const [x,y]of SLICE_TREES)for(const dx of [-8,0,8])expect(canStand("town",{x:x+dx,y}),`tree ${x},${y}`).toBe(false);
    for(const p of STREET_PROPS)for(const dx of [-16,0,16])expect(canStand("town",{x:p.x+dx,y:p.y}),`prop ${p.x},${p.y}`).toBe(false);
    for(const [x,y,w]of GARDEN_EDGES)for(let d=0;d<=w;d+=2)expect(canStand("town",{x:x+d,y}),`edge ${x+d},${y}`).toBe(false);
    for(const [x,y,w]of SLICE_FLOWERS)for(let d=0;d<=w;d+=2)expect(canStand("town",{x:x+d,y:y+15}),`flower ${x+d},${y+15}`).toBe(false);
  });
});

