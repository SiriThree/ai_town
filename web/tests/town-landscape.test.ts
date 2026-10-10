import {describe,it,expect} from "vitest";
import {canStand,PORTALS} from "../src/lib/scene-data";
import {LANDSCAPE_TREES,YARD_FENCES,DISTRICT_PROPS,landscapeWater,riverBanks,LANDMARKS,districtMask,inPolygon} from "../src/lib/town-landscape";
import {BRIDGES} from "../src/lib/town-map";
describe("whole-map landscape remains compatible with saved paths",()=>{
  it("district IDs come from geometry and remain valid on boundaries and overlaps without canvas readback",()=>{
    const width=1400,height=800,mask=districtMask(width,height,2);
    expect(new Set(mask)).toEqual(new Set([0,1,2,3,4,5,6,7]));
    for(let y=0;y<height;y+=7)for(let x=0;x<width;x+=7){
      let expected=0;
      LANDMARKS.forEach((l,i)=>{if(inPolygon(x*2+1,y*2+1,l.polygon))expected=i+1;});
      expect(mask[y*width+x]).toBe(expected);
    }
    expect(mask[0]).toBe(0);
    expect(mask[200*width+250]).toBe(1);
    expect(mask[400*width+400]).toBe(3);
  });
  it("has authored districts, variable banks and irregular groves, without adding buildings",()=>{
    expect(LANDMARKS).toHaveLength(7);expect(PORTALS.filter(p=>p.source==="town")).toHaveLength(12);
    expect(LANDSCAPE_TREES.length).toBeGreaterThan(100);expect(new Set(LANDSCAPE_TREES.map(t=>t[1])).size).toBeGreaterThan(80);
    expect(Math.abs(riverBanks(780).left-riverBanks(1000).left)).toBeGreaterThan(10);
  });
  it("new river pixels do not flood legal ground, and both original crossings remain open",()=>{
    for(let y=0;y<=1600;y+=4)for(let x=1720;x<2030;x+=4)if(landscapeWater(x,y))expect(canStand("town",{x,y}),`water ${x},${y}`).toBe(false);
    for(const b of BRIDGES)for(let x=b.x+10;x<b.x+b.w-10;x+=2){expect(landscapeWater(x,b.y+b.h/2)).toBe(false);expect(canStand("town",{x,y:b.y+b.h/2})).toBe(true);}
  });
  it("trees, yard fences and props never occupy any existing standable point",()=>{
    for(const [x,y]of LANDSCAPE_TREES)for(const dx of [-8,0,8])expect(canStand("town",{x:x+dx,y})).toBe(false);
    for(const f of YARD_FENCES)for(let d=0;d<=f.length;d+=2){const p={x:f.x+(f.vertical?0:d),y:f.y+(f.vertical?d:0)};expect(canStand("town",p)).toBe(false);expect(landscapeWater(p.x,p.y)).toBe(false);}
    for(const p of DISTRICT_PROPS)for(const dx of [-16,0,16])expect(canStand("town",{x:p.x+dx,y:p.y})).toBe(false);
  });
});
