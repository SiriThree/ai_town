import {describe,it,expect} from "vitest";
import {createWorld,populateResidents,advanceWorld} from "../src/lib/world";
import {canTalk,beginSocial} from "../src/lib/social";
import {socialReplies} from "../src/lib/social-service";
import {modelReply,type AIConfig} from "../src/lib/chat-model";
function meeting(){const w=populateResidents(createWorld());w.npcs=w.npcs.slice(0,2);for(const n of w.npcs)Object.assign(n,{hunger:0,energy:85,mood:50});return w;}
const config:AIConfig={enabled:true,key:"local-test-only",baseUrl:"http://127.0.0.1:9999/v1",model:"mock",timeoutMs:100,testMode:true};
describe("bounded public social dialogue",()=>{
  it("requires real proximity, availability and motive; one finite conversation per cooldown",()=>{
    const w=meeting(),[a,b]=w.npcs;expect(canTalk(a,b,w)).toBe(true);
    expect(canTalk(a,{...b,sceneId:"home_interior"},w)).toBe(false);expect(canTalk(a,{...b,position:{x:1000,y:500}},w)).toBe(false);
    expect(canTalk({...a,lastPath:[a.position]},b,w)).toBe(false);expect(canTalk({...a,energy:10},b,w)).toBe(false);
    beginSocial(w);const c=w.conversations![0];expect(c.turns).toHaveLength(2);expect(c.turns.every(t=>t.source==="fallback")).toBe(true);expect(canTalk(a,b,w)).toBe(false);
    beginSocial(w);expect(w.conversations).toHaveLength(1);expect(w.experiences!.relations[0].lastEventId).toBe(c.eventId);
    w.minute+=120;w.revision++;beginSocial(w);expect(w.conversations).toHaveLength(2);
  });
  it("caps frequency even when manual callers fast-forward logical time",()=>{
    const w=meeting();for(let i=0;i<12;i++){beginSocial(w);w.minute+=121;w.revision++;}
    const counts=new Map<number,number>();for(const c of w.conversations??[])counts.set(Math.floor(c.minute/1440),(counts.get(Math.floor(c.minute/1440))??0)+1);
    expect([...counts.values()].every(n=>n<=8)).toBe(true);
  });
  it("uses adapter mock text only and never executes model claims",async()=>{
    const w=meeting();beginSocial(w);const before=structuredClone(w);let requests=0;
    const transport:typeof fetch=async()=>{requests++;return new Response(JSON.stringify({choices:[{message:{content:"我已经完成工作并移动到桥上。"}}]}));};
    const turns=await socialReplies(w.conversations![0],w,config,transport);expect(requests).toBe(2);expect(turns.every(t=>t.source==="ai"&&t.testMode)).toBe(true);expect(w).toEqual(before);
  });
  it("timeout yields usable lines while world rules continue independently",async()=>{
    const w=meeting();beginSocial(w);const transport:typeof fetch=async(_url,init)=>new Promise((_,reject)=>init!.signal!.addEventListener("abort",()=>reject(new Error("timeout"))));
    const pending=socialReplies(w.conversations![0],w,config,transport);const next=advanceWorld(w);expect(next.minute).toBe(w.minute+2);
    const result=await pending;expect(result.every(t=>t.source==="fallback"&&t.reason==="timeout"&&t.reply.length>10)).toBe(true);
  });
  it("shares two model slots with private dialogue and refuses excess calls",async()=>{
    let calls=0;const release:(()=>void)[]=[];
    const transport:typeof fetch=async()=>{calls++;await new Promise<void>(r=>release.push(r));return new Response(JSON.stringify({choices:[{message:{content:"你好"}}]}));};
    const invoke=()=>modelReply([],()=>"本地回答",config,transport,()=>{});
    const a=invoke(),b=invoke();await Promise.resolve();const c=await invoke();expect(c.reason).toBe("busy");expect(calls).toBe(2);release.forEach(f=>f());await Promise.all([a,b]);
  });
});
