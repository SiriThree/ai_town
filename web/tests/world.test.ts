import { HOME_REST } from "../src/lib/scene-data";
import { describe, it, expect } from "vitest";
import { advanceWorld, assertWorld, canExecute, createWorld, decide, execute, positionAt, roadPath, type LocationId } from "../src/lib/world";

describe("可解释的居民行为", () => {
  it("同一居民在其他条件不变时，饥饿与低精力改变下一步", () => {
    const w = createWorld(), n = w.npcs[0];
    n.hunger = 20;
    expect(decide(n,w).action).toEqual({kind:"socialize"});
    n.hunger = 85;
    expect(decide(n,w).action).toEqual({kind:"move",to:"cafe"});
    n.hunger = 20; n.energy = 12;
    expect(decide(n,w).action).toEqual({kind:"move",to:"home"});
  });
  it("相同需求与地点，不同性格选择不同活动", () => {
    const w=createWorld(); w.npcs.forEach(n => {n.hunger=20;n.energy=80;n.mood=60;});
    expect(decide(w.npcs[0],w).action.kind).toBe("socialize");
    expect(decide(w.npcs[1],w).action.kind).toBe("read");
  });
  it("没有伙伴不社交；不在咖啡馆不能进食，不在住宅不能休息", () => {
    const w=createWorld(), n=w.npcs[0]; n.hunger=20; w.npcs[1].location="home";
    expect(decide(n,w).action.kind).toBe("read");
    for(const kind of ["eat","rest","socialize"] as const) {
      expect(canExecute(n,{kind},w)).toBe(false);
      expect(() => execute(n,{action:{kind},reason:"测试"},w)).toThrow("非法动作");
    }
  });
  it("饥饿到达目的地后才吃饭，效果符合定义且不修改输入", () => {
    const w=createWorld(), before=structuredClone(w), next=advanceWorld(w);
    expect(w).toEqual(before);
    expect(next.npcs[0].location).toBe("cafe");
    expect(next.npcs[0].hunger).toBe(67);
    const entered=advanceWorld(next);
    expect(entered.npcs[0].sceneId).toBe("cafe_interior");
    expect(entered.npcs[0].hunger).toBe(75);
    const after=advanceWorld(entered);
    expect(after.npcs[0].action).toBe("享用餐点");
    expect(after.npcs[0].hunger).toBe(33);
    expect(after.npcs[0].energy).toBe(63);
    expect(after.events).toHaveLength(6);
    expect(after.minute).toBe(510);
  });
  it("需求组合与地点矩阵都产生合法动作，效果有界", () => {
    for(const location of ["home","cafe","square"] as const) for(const hunger of [0,64,65,100]) for(const energy of [0,25,26,100]) {
      const w=createWorld(), n=w.npcs[0]; Object.assign(n,{location,position:positionAt(location,n.id),hunger,energy,mood:99});
      const d=decide(n,w); expect(canExecute(n,d.action,w)).toBe(true);
      const result=execute(n,d,w);
      for(const v of [result.hunger,result.energy,result.mood]) {expect(v).toBeGreaterThanOrEqual(0);expect(v).toBeLessThanOrEqual(100);}
    }
  });
  it("休息、阅读、社交的状态效果准确，极值会裁剪", () => {
    const w=createWorld(), n=w.npcs[0]; n.hunger=10;n.energy=90;n.mood=95;
    const read=execute(n,{action:{kind:"read"},reason:"测试"},w);
    expect([read.energy,read.mood]).toEqual([88,100]);
    const social=execute(n,{action:{kind:"socialize"},reason:"测试"},w);
    expect([social.energy,social.mood]).toEqual([84,100]);
    n.location="home";n.sceneId="home_interior";n.position=HOME_REST[n.id].position;
    const rest=execute(n,{action:{kind:"rest"},reason:"测试"},w);
    expect([rest.energy,rest.mood]).toEqual([100,99]);
  });
  it("移动路径沿道路，不穿建筑或喷泉；终点与居民位置相符", () => {
    const obstacles=[{x:118,y:119,w:202,h:172},{x:654,y:119,w:204,h:172},{x:437,y:399,w:84,h:57}];
    for(const id of ["aqing","aning"] as const) for(const from of ["home","cafe","square"] as LocationId[]) for(const to of ["home","cafe","square"] as LocationId[]) {
      if(from===to) continue;
      const n=createWorld().npcs.find(n=>n.id===id)!; n.location=from;n.position=positionAt(from,id);
      const path=roadPath(n,to); expect(path.at(-1)).toEqual(positionAt(to,id));
      for(let i=1;i<path.length;i++) for(let k=0;k<=50;k++) {
        const p={x:path[i-1].x+(path[i].x-path[i-1].x)*k/50,y:path[i-1].y+(path[i].y-path[i-1].y)*k/50};
        expect(obstacles.some(r=>p.x>r.x&&p.x<r.x+r.w&&p.y>r.y&&p.y<r.y+r.h)).toBe(false);
      }
    }
  });
  it("多步推进维持状态界限、稳定结果和日志上限", () => {
    let a=createWorld(),b=createWorld();
    for(let i=0;i<120;i++) {a=advanceWorld(a);b=advanceWorld(b);expect(()=>assertWorld(a)).not.toThrow();}
    expect(a).toEqual(b);expect(a.events).toHaveLength(100);expect(a.revision).toBe(120);
  });
  it("坏版本和坏位置拒绝恢复，不重置为种子", () => {
    const w=createWorld(); w.npcs[0].position.x=10;
    expect(()=>assertWorld(w)).toThrow();
    expect(()=>assertWorld({...createWorld(),schemaVersion:99})).toThrow();
  });
});
