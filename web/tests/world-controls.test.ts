import { describe, it, expect } from "vitest";
import { advanceOnClock, advanceWorld, assertWorld, createWorld, giveFood, runState, AUTO_INTERVAL_MS } from "../src/lib/world";

describe("食物干预与下一步决策",()=>{
  it("控制其他条件：未送食物去咖啡馆，送食物后留在广场社交",()=>{
    const before=createWorld(), snapshot=structuredClone(before);
    const fed=giveFood(before,"aqing");
    expect(before).toEqual(snapshot);
    expect(fed.npcs[0]).toEqual({...before.npcs[0],hunger:24});
    expect(fed.npcs[1]).toEqual(before.npcs[1]);
    expect(fed.minute).toBe(before.minute);
    const control=advanceWorld(before), changed=advanceWorld(fed);
    expect(control.npcs[0].hunger).toBe(67);expect(control.npcs[0].location).toBe("cafe");
    expect(changed.npcs[0].hunger).toBe(32);expect(changed.npcs[0].action).toBe("与邻居闲聊");
    expect(changed.npcs[0].location).toBe("square");
    expect(fed.events.at(-1)?.text).toContain("59 → 24");
  });
  it("饱足下限为0，未知居民/已经吃饱拒绝；不强迫低精力居民社交",()=>{
    const w=createWorld();w.npcs[0].hunger=10;w.npcs[0].energy=12;
    const fed=giveFood(w,"aqing");expect(fed.npcs[0].hunger).toBe(0);
    expect(()=>giveFood(fed,"aqing")).toThrow("吃饱");expect(()=>giveFood(w,"missing")).toThrow("居民不存在");
    expect(advanceWorld(fed).npcs[0].location).toBe("home");
  });
  it("干预与推进混合时事件唯一有界、状态合法",()=>{
    let w=createWorld();
    for(let i=0;i<80;i++){w=giveFood(w,"aqing");w=advanceWorld(w);expect(()=>assertWorld(w)).not.toThrow();}
    expect(w.events.length).toBe(100);expect(new Set(w.events.map(e=>e.id)).size).toBe(100);
  });
});
describe("自动推进时钟",()=>{
  it("旧存档默认暂停；到期前和暂停后不推进",()=>{
    const w=createWorld();expect(runState(w).running).toBe(false);expect(advanceOnClock(w,10000,true)).toBe(w);
    w.run={running:true,nextTickAt:5000};expect(advanceOnClock(w,4999,true)).toBe(w);
    w.run={running:false,nextTickAt:null};expect(advanceOnClock(w,5000,true)).toBe(w);
  });
  it("到期只推进一次，同一时刻重发无操作；长时间离线最多一步",()=>{
    const w=createWorld();w.run={running:true,nextTickAt:5000};
    const next=advanceOnClock(w,5000,true);expect(next.minute).toBe(w.minute+10);
    expect(next.run?.nextTickAt).toBe(10000);expect(advanceOnClock(next,5000,true)).toBe(next);
    const resumed=advanceOnClock(next,100000000,true);expect(resumed.minute).toBe(next.minute+10);
    expect(resumed.run?.nextTickAt).toBe(100000000+AUTO_INTERVAL_MS);
  });
  it("手动推进共用规则并推迟下一次自动时刻；送食物保留到期时间",()=>{
    const w=createWorld();w.run={running:true,nextTickAt:5000};
    const next=advanceOnClock(w,4000,false);expect(next.npcs).toEqual(advanceWorld(w).npcs);
    expect(next.run?.nextTickAt).toBe(9000);expect(advanceOnClock(next,5000,true)).toBe(next);
    expect(giveFood(w,"aqing").run).toEqual(w.run);
  });
  it("坏运行状态不悄悄恢复为新世界",()=>{
    for(const run of [{running:true,nextTickAt:null},{running:false,nextTickAt:8},{running:true,nextTickAt:-1}])expect(()=>assertWorld({...createWorld(),run})).toThrow();
  });
});
