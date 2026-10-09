import {describe,it,expect} from "vitest";
import {SCENES,PORTALS,INTERIORS,canStand,portalById,validScenePath} from "../src/lib/scene-data";
import {TOWN_BUILDINGS,TOWN_SIZE} from "../src/lib/town-map";
import {newPlayer,enterPortal,restorePlayer,movePlayer} from "../src/lib/player-scene";
import {sceneTransform,screenPoint,boundedCamera,overviewCamera,followPlayer} from "../src/lib/scene-view";
import {createWorld,advanceWorld,restoreWorld,roadPath,positionAt} from "../src/lib/world";

describe("east district and stable world coordinates",()=>{
  it("preserves old portals and resident road endpoints",()=>{
    expect(portalById("home-door").position).toEqual({x:226,y:320});expect(portalById("cafe-door").position).toEqual({x:762,y:320});
    expect(positionAt("cafe","aqing")).toEqual({x:754,y:324});expect(positionAt("home","aning")).toEqual({x:234,y:324});
    for(const id of ["aqing","aning"] as const)for(const from of ["home","cafe","square"] as const)for(const to of ["home","cafe","square"] as const){
      const n={...createWorld().npcs.find(n=>n.id===id)!,location:from,position:positionAt(from,id)};
      expect(validScenePath("town",roadPath(n,to))).toBe(true);
    }
  });
  it("connects old street, store and cottage by real walkable corridors",()=>{
    expect(validScenePath("town",[{x:620,y:370},{x:1158,y:370},{x:1158,y:324}])).toBe(true);
    expect(validScenePath("town",[{x:1158,y:324},{x:1158,y:370},{x:1030,y:370},{x:1030,y:578},{x:1510,y:578},{x:1510,y:524}])).toBe(true);
    expect(TOWN_SIZE.width).toBeGreaterThan(960);
  });
  it("has four independently paired entrances and unique indoor destinations",()=>{
    const doors=PORTALS.filter(p=>p.source==="town");expect(doors).toHaveLength(4);expect(new Set(doors.map(p=>p.target)).size).toBe(4);
    for(const door of doors){const reverse=portalById(door.reverseId);expect(reverse.target).toBe("town");expect(reverse.reverseId).toBe(door.id);expect(canStand("town",reverse.spawn)).toBe(true);
      const p={...newPlayer(),position:door.position};const inside=enterPortal(p,door.id);expect(inside.sceneId).toBe(door.target);
      expect(canStand(inside.sceneId,inside.position)).toBe(true);expect(restorePlayer(inside)).toEqual(inside);expect(enterPortal(inside,reverse.id).position).toEqual(reverse.spawn);
      expect(enterPortal(p,doors.find(d=>d.id!==door.id)!.id)).toEqual(p);
    }
    expect(INTERIORS.store_interior.furniture).not.toEqual(INTERIORS.cottage_interior.furniture);
  });
  it("blocks building and furniture interiors and allows safe restored positions",()=>{
    for(const b of TOWN_BUILDINGS)expect(canStand("town",{x:b.solid.x+b.solid.w/2,y:b.solid.y+b.solid.h/2})).toBe(false);
    for(const id of ["store_interior","cottage_interior"] as const){for(const f of INTERIORS[id].furniture)expect(canStand(id,{x:f.solid.x+f.solid.w/2,y:f.solid.y+f.solid.h/2})).toBe(false);
      expect(restorePlayer({...newPlayer(),sceneId:id,position:{x:-1,y:-1}})).toMatchObject({sceneId:id,position:{x:480,y:486}});
      let p={...newPlayer(),sceneId:id,position:{x:480,y:486}};for(let i=0;i<120;i++)p=movePlayer(p,0,1,.05) as typeof p;expect(p.position.y).toBeLessThanOrEqual(503);
    }
  });
  it("keeps old v1/v2 stored coordinates untouched and original decisions in original scenes",()=>{
    for(const version of [1,2]){const raw=JSON.parse(JSON.stringify(createWorld()));raw.schemaVersion=version;if(version===1)for(const n of raw.npcs)delete n.sceneId;
      const before=structuredClone(raw),restored=restoreWorld(raw);expect(raw).toEqual(before);expect(restored.npcs.map(n=>n.position)).toEqual(before.npcs.map((n:{position:unknown})=>n.position));
    }
    let w=createWorld();for(let i=0;i<200;i++){w=advanceWorld(w);for(const n of w.npcs)expect(["town","home_interior","cafe_interior"]).toContain(n.sceneId);}
  });
  it("can frame the expanded map, pan to its east edge, and follow only actual player positions",()=>{
    const view={width:1346,height:710},overview=overviewCamera(view,"town"),t=sceneTransform(view,overview);
    expect(boundedCamera({...overview,x:overview.x-30},view).zoom).toBe(overview.zoom);expect(t.x).toBeGreaterThanOrEqual(0);expect(t.x+TOWN_SIZE.width*t.scale).toBeLessThanOrEqual(view.width);
    const c=followPlayer({x:1510,y:578},view,{zoom:1,x:0,y:0},"town"),p=screenPoint({x:1510,y:578},view,c);
    expect(p.x).toBeLessThan(view.width);expect(p.y).toBeLessThan(view.height);expect(c.x).toBeLessThan(-400);
    expect(followPlayer({x:620,y:370},view,{zoom:1,x:0,y:0},"town")).toEqual({zoom:1,x:0,y:0});
    expect(boundedCamera({...c,x:-99999},view).x).toBeGreaterThan(-99999);
    expect(SCENES.store_interior.size).toEqual({width:960,height:600});
  });
});
