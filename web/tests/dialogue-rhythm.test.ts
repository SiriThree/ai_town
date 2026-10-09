import {fallbackReply} from "../src/lib/chat-context";
import {describe,it,expect} from "vitest";
import {advanceWorld,populateResidents,createWorld,assertWorld} from "../src/lib/world";
import {beginSocial,advanceConversations,canTalk,TURN_MS} from "../src/lib/social";
import {socialReplies} from "../src/lib/social-service";
import {bubbleText,visibleCharacters,shortEnough} from "../src/lib/dialogue-text";
import {relationFor} from "../src/lib/experiences";
const meeting=()=>{const w=populateResidents(createWorld());for(const n of w.npcs.slice(0,2))Object.assign(n,{hunger:0,energy:90,mood:40});for(const n of w.npcs.slice(2))n.hunger=90;return w;};
describe("finite persisted public conversation turns",()=>{
  it("one session, one ordered turn; participants stand still while other residents live",()=>{
    let w=meeting();beginSocial(w);const c=w.conversations![0],positions=w.npcs.slice(0,2).map(n=>n.position),other=w.npcs[4].position;
    for(let i=0;i<4;i++){w=advanceWorld(w);assertWorld(w);expect(w.conversations![0].timeline?.turnIndex).toBe(0);expect(w.npcs.slice(0,2).map(n=>n.position)).toEqual(positions);}
    w=advanceWorld(w);expect(w.conversations![0].timeline).toEqual({turnIndex:1,elapsedMs:TURN_MS,completed:false});
    expect(w.npcs[4].position).not.toEqual(other);expect(w.conversations![0].id).toBe(c.id);
    for(let i=0;i<5;i++)w=advanceWorld(w);expect(w.conversations![0].timeline?.completed).toBe(true);
    expect(w.conversations).toHaveLength(1);expect(w.npcs.slice(0,2).map(n=>n.position)).toEqual(positions);
    w=advanceWorld(w);expect(w.npcs[0].ongoing).toBeDefined();
  });
  it("new session IDs cannot share a previous round; greetings do not grant trust",()=>{
    const w=meeting();beginSocial(w);const first=w.conversations![0];expect(relationFor(w,"aqing","aning")?.trust).toBe(0);
    expect(canTalk(w.npcs[0],w.npcs[1],w)).toBe(false);for(let i=0;i<10;i++)advanceConversations(w);
    w.minute+=120;w.revision++;beginSocial(w);const second=w.conversations!.at(-1)!;
    expect(second.id).not.toBe(first.id);expect(second.timeline).toEqual({turnIndex:0,elapsedMs:0,completed:false});expect(second.eventId).not.toBe(first.eventId);
    for(const c of w.conversations!)expect(c.turns.every(t=>shortEnough(t.reply))).toBe(true);
  });
  it("busy work is not interrupted; no conversation with remote or hungry residents",()=>{
    const w=meeting(),[a,b]=w.npcs;for(const patch of [{hunger:90},{sceneId:"cafe_interior"},{position:{x:1000,y:350}},{action:"正在制作餐点"}])expect(canTalk({...a,...patch} as typeof a,b,w)).toBe(false);
  });
  it("asks for short speech and rejects overlength once, preserving rejected original as evidence",async()=>{
    const w=meeting();beginSocial(w);let calls=0;const seen:string[]=[];
    const transport:typeof fetch=async(_url,init)=>{calls++;seen.push(String(init?.body));return new Response(JSON.stringify({choices:[{message:{content:"这是一段超过三十个可见字符的很长很长的回答，不能作为小镇的短对白直接显示给玩家。"}}]}));};
    const result=await socialReplies(w.conversations![0],w,{enabled:true,key:"test",baseUrl:"http://127.0.0.1",model:"local",testMode:true,timeoutMs:1000},transport);
    expect(calls).toBe(2);expect(seen.every(s=>s.includes("不超过30字"))).toBe(true);expect(result.every(r=>r.source==="fallback"&&r.reason==="invalid_response"&&shortEnough(r.reply)&&"rejectedReply" in r)).toBe(true);
  });
  it("player local replies also stay short and keep current facts/personality",()=>{
    const w=meeting();for(const n of w.npcs)for(const message of ["你好","你是谁","你现在在哪","你饿吗","想休息吗","心情如何","记得什么","去咖啡馆"]){expect(shortEnough(fallbackReply(n,w,message))).toBe(true);}
  });
  it("counts visible graphemes and balances punctuation lines without single-character tails",()=>{
    expect(visibleCharacters("👨‍👩‍👧‍👦你好")).toHaveLength(3);
    for(const text of ["今天的天气很适合散步，一起去看看吧。","我们一起慢慢聊聊今天在小镇发生的事情吧。"]){const lines=bubbleText(text).split("\n");expect(lines.every(l=>visibleCharacters(l).length>1)).toBe(true);expect(lines.join("")).toBe(text);}
  });
});
