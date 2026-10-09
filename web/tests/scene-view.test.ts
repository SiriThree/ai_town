import { describe, expect, it } from "vitest";
import { bubblePlacement, screenPoint, sceneTransform, HEAD_HEIGHT } from "../src/lib/scene-view";

describe("scene speech coordinates",()=>{
  const view={width:960,height:600}, camera={zoom:1,x:0,y:0}, point={x:442,y:368};
  it("keeps each desktop raster pixel an integer number of screen pixels",()=>{
    for(const v of [{width:1346,height:543},{width:1312,height:411}])for(const zoom of [1,1.25,1.5,1.75,2]){
      const t=sceneTransform(v,{zoom,x:17.25,y:26.25});expect(Number.isInteger(t.scale*2)).toBe(true);expect(Number.isInteger(t.x)&&Number.isInteger(t.y)).toBe(true);
    }
  });
  it("reserves camera controls at the upper edge",()=>{
    const b=bubblePlacement({x:746,y:306},{width:1346,height:543},{zoom:4/3,x:30,y:20},{width:310,height:188})!;
    expect(b).not.toBeNull();expect(b.top).toBeGreaterThanOrEqual(60);
  });
  it("uses the same fit/zoom/pan for the actor and bubble tail",()=>{
    for(const v of [view,{width:390,height:400},{width:1190,height:743}]) {
      const c={zoom:1.5,x:30,y:25}, foot=screenPoint(point,v,c);
      const b=bubblePlacement(point,v,c,{width:310,height:188})!;
      expect(b).not.toBeNull();expect(b.left+b.tail).toBeCloseTo(foot.x);
      expect(b.top+b.height+10).toBeCloseTo(foot.y-HEAD_HEIGHT*sceneTransform(v,c).scale);
    }
  });
  it("clamps horizontal edges without moving the tail away from its resident",()=>{
    for(const x of [18,942]) {
      const b=bubblePlacement({x,y:368},view,camera,{width:310,height:188})!;
      expect(b.left).toBeGreaterThanOrEqual(12);expect(b.left+b.width).toBeLessThanOrEqual(948);
      expect(b.left+b.tail).toBe(x);
    }
  });
  it("shortens at the top rather than overlap the actor",()=>{
    const b=bubblePlacement({x:442,y:190},view,camera,{width:310,height:188})!;
    expect(b.top).toBeGreaterThanOrEqual(10);expect(b.height).toBeLessThan(188);
    expect(b.top+b.height).toBeLessThan(screenPoint({x:442,y:190},view,camera).y-HEAD_HEIGHT);
  });
  it("does not leave bubbles for offscreen or clipped residents",()=>{
    for(const p of [{x:-1,y:368},{x:970,y:368},{x:442,y:610},{x:442,y:50}]) expect(bubblePlacement(p,view,camera,{width:310,height:188})).toBeNull();
  });
});
