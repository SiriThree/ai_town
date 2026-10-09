import { describe,it,expect } from "vitest";
import { canStand,enterPortal,movePlayer,nearbyPortal,newPlayer,playerPose,restorePlayer,SCENES,type Player } from "../src/lib/player-scene";
import { sceneTransform } from "../src/lib/scene-view";

const walk=(p:Player,x:number,y:number,steps=60)=>{for(let i=0;i<steps;i++)p=movePlayer(p,x,y,1/60);return p;};
describe("local player and two real scenes",()=>{
  it("starts safely, normalizes diagonal speed and caps resumed-frame delta",()=>{
    const p=newPlayer(),straight=movePlayer(p,1,0,.02),diagonal=movePlayer(p,1,1,.02);
    expect(canStand(p.sceneId,p.position)).toBe(true);
    expect(Math.hypot(diagonal.position.x-p.position.x,diagonal.position.y-p.position.y)).toBeCloseTo(straight.position.x-p.position.x);
    expect(movePlayer(p,1,0,999).position.x-p.position.x).toBeCloseTo(6.6);
    expect(movePlayer(p,Infinity,0,1)).toBe(p);
  });
  it("blocks building, road boundary and plaza furniture without tunnelling",()=>{
    const p={...newPlayer(),position:{x:762,y:324}};
    expect(walk(p,0,-1,600).position.y).toBeGreaterThanOrEqual(309);
    expect(walk(newPlayer(),0,1,600).position.y).toBeLessThanOrEqual(401);
    expect(canStand("town",{x:480,y:450})).toBe(false);
    expect(canStand("town",{x:226,y:250})).toBe(false);
  });
  it("connects street to cafe apron and validates current-scene proximity and portal ID",()=>{
    const street=walk(newPlayer(),1,0,65),door=walk(street,0,-1,22);
    expect(nearbyPortal(door)?.id).toBe("cafe-door");
    expect(enterPortal(newPlayer(),"cafe-door")).toEqual(newPlayer());
    expect(enterPortal(door,"unknown")).toBe(door);
    const inside=enterPortal(door,"cafe-door");
    expect(inside.sceneId).toBe("cafe_interior");
    expect(canStand(inside.sceneId,inside.position)).toBe(true);
    expect(enterPortal(inside,"cafe-door")).toBe(inside);
    const outside=enterPortal(inside,"cafe-exit");
    expect(outside).toMatchObject({sceneId:"town",position:{x:762,y:324},facing:"south"});
    expect(canStand(outside.sceneId,outside.position)).toBe(true);
  });
  it("has traversable interior space, solid walls/furniture and repeatable safe roundtrips",()=>{
    let p:Player={version:1,sceneId:"cafe_interior",position:{x:480,y:486},facing:"north"};
    expect(walk(p,0,-1).position.y).toBeLessThan(360);
    expect(walk({...p,position:{x:320,y:390}},0,-1,600).position.y).toBeGreaterThanOrEqual(376);
    expect(walk({...p,position:{x:480,y:280}},0,-1,600).position.y).toBeGreaterThanOrEqual(175);
    for(const f of SCENES.cafe_interior.obstacles)expect(canStand("cafe_interior",{x:f.x+f.w/2,y:f.y+f.h/2})).toBe(false);
    for(let i=0;i<10;i++){p=enterPortal(p,"cafe-exit");p=enterPortal(p,"cafe-door");}
    expect(p.position).toEqual({x:480,y:486});
  });
  it("restores valid per-tab state; rejects corrupt, unknown and obstructed positions",()=>{
    const indoor:Player={version:1,sceneId:"cafe_interior",position:{x:480,y:380},facing:"east"};
    expect(restorePlayer(indoor)).toEqual(indoor);
    for(const bad of [null,{},"text",{version:1,sceneId:"secret"}])expect(restorePlayer(bad)).toEqual(newPlayer());
    expect(restorePlayer({...indoor,position:{x:320,y:340}}).position).toEqual({x:480,y:486});
    expect(restorePlayer({...newPlayer(),position:{x:NaN,y:2}})).toEqual(newPlayer());
  });
  it("poses stop at idle and interior camera fits the complete room at both desktop sizes",()=>{
    expect(playerPose(newPlayer(),false,500).frame).toBe(0);
    expect(playerPose(newPlayer(),true,140).frame).toBe(1);
    for(const size of [{width:1312,height:576},{width:1350,height:708}]){
      const t=sceneTransform(size,{zoom:1,x:0,y:0},"cafe_interior");
      expect(100*t.scale+t.y).toBeGreaterThanOrEqual(0);
      expect(530*t.scale+t.y).toBeLessThan(size.height);
    }
  });
});
