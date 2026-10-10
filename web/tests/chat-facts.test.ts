import {expect,it} from "vitest";
import {retrievePlayerFacts,checkChatFacts,recallFallback,type InvitationSource} from "../src/lib/chat-facts";
import {advanceWorld,createWorld,populateResidents} from "../src/lib/world";
const source=(status:InvitationSource["appointment"]["status"]="arrived"):InvitationSource=>({appointment:{id:"meeting-1",target:"cafe",status,createdMinute:480,updatedMinute:490,arrivedMinute:status==="arrived"?490:undefined,deadlineMinute:1080,reason:"后台结果"},confirmation:{id:"confirmation-1",message:"我们一起去咖啡馆吧",minute:480,worldRevision:1}});
it("提取原始邀请和实际到达，携带同一约定及确认来源、按发生时间排序",()=>{
 const r=retrievePlayerFacts([source()],"之前说了什么？",490);
 expect(r.events.map(e=>[e.kind,e.minute,e.sourceId,e.turnId])).toEqual([["invited",480,"meeting-1","confirmation-1"],["arrived",490,"meeting-1","confirmation-1"]]);
 expect(r.events[1].result).toContain("不证明玩家也到场");
});
it("跨天按世界日筛选；未来事件、损坏确认和无证据经历不进入上下文",()=>{
 expect(retrievePlayerFacts([source()],"昨天发生什么？",1930).events).toHaveLength(2);
 expect(retrievePlayerFacts([source()],"今天发生什么？",1930).events).toEqual([]);
 expect(retrievePlayerFacts([source()],"约定",482).events.map(e=>e.kind)).toEqual(["invited"]);
 const bad=source();bad.confirmation.minute=481;
 expect(retrievePlayerFacts([bad],"约定",1930).events).toEqual([]);
 expect(recallFallback(retrievePlayerFacts([],"昨天",1930))).toContain("没有可核实");
});
it("同一时刻接受和到达仍先邀请；只识别正确居民的称呼",()=>{
 const s=source();s.appointment.arrivedMinute=480;s.confirmation.message="阿宁，我们一起去咖啡馆吧";
 expect(retrievePlayerFacts([s],"约定",490,"阿宁").events.map(e=>e.kind)).toEqual(["invited","arrived"]);
 expect(retrievePlayerFacts([s],"约定",490,"阿晴").events).toEqual([]);
});
it("拒绝/推迟不是接受；取消回执不是第二次邀请；失败保留原因",()=>{
 for(const status of ["refused","deferred"] as const)expect(retrievePlayerFacts([source(status)],"约定",490).events.map(e=>e.kind)).toEqual([status]);
 const cancelled=source("cancelled");cancelled.confirmation.message="取消约定";
 expect(retrievePlayerFacts([cancelled],"约定",490).events.map(e=>e.kind)).toEqual(["cancelled"]);
 expect(retrievePlayerFacts([source("failed")],"约定",490).events.map(e=>e.kind)).toEqual(["invited","failed"]);
});
it("真实规则生成的途中进度0不能声称一半；原始模型文本与任务来源保留",()=>{
 const w=advanceWorld(populateResidents(createWorld())),n=w.npcs.find(n=>n.id==="laolin")!;
 expect(n.workTask?.progress).toBe(0);expect(n.ongoing?.decision.action.kind).toBe("move");
 const original={reply:"货架整理才做到一半，得先收个尾。",source:"ai" as const};
 const checked=checkChatFacts(original,n,w,{requestedDay:null,events:[]});
 expect(checked.source).toBe("fallback");expect(checked.reason).toBe("fact_conflict");expect(checked.factCheck?.originalReply).toBe(original.reply);expect(checked.factCheck?.sourceIds).toEqual([n.workTask!.id]);expect(checked.reply).toContain("我正去");
 n.workTask!.progress=1;expect(checkChatFacts(original,n,w,{requestedDay:null,events:[]})).toBe(original);
});
it("有效自然对白、否定句及有明确历史标记的句子不被一律模板化",()=>{
 const w=advanceWorld(populateResidents(createWorld())),n=w.npcs.find(n=>n.id==="laolin")!;
 for(const text of ["还没开始呢，我正赶过去。","货架还没整理一半。","昨天货架整理了一半，后来收尾了。"]){const r={source:"ai" as const,reply:text};expect(checkChatFacts(r,n,w,{requestedDay:null,events:[]})).toBe(r);}
});
it("已证实赴约时不能否认此前邀请；没有该访客证据则不补造经历",()=>{
 const w=createWorld(),n=w.npcs[1],r={source:"ai" as const,reply:"来咖啡馆赴约。刚才只简单打过招呼。"};
 const guarded=checkChatFacts(r,n,w,retrievePlayerFacts([source()],"为什么来",490));
 expect(guarded.factCheck?.sourceIds).toEqual(["meeting-1"]);expect(guarded.reply).toContain("你约我");
 expect(checkChatFacts(r,n,w,{requestedDay:null,events:[]})).toBe(r);
});
