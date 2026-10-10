import {it,expect} from "vitest";
import {advanceWorld,createWorld,populateResidents} from "../src/lib/world";
import {buildMessages} from "../src/lib/chat-context";
import {emptyPlayerMemory,rememberPlayer} from "../src/lib/player-memory";
import type {Appointment} from "../src/lib/appointments";
it("真实验收暴露的工作误述：途中active任务与实际工作状态分开",()=>{
 const w=advanceWorld(populateResidents(createWorld())),n=w.npcs.find(n=>n.id==="laolin")!;
 expect(n.workTask?.progress).toBe(0);expect(n.ongoing?.decision.action.kind).toBe("move");
 const messages=buildMessages(n,w,[],"为什么没能立即出发？"),facts=JSON.parse(messages[0].content.split("世界事实：\n")[1]);
 expect(facts.workTask).toEqual(n.workTask);expect(facts.performingWork).toBe(false);
 expect(messages[1].content).toContain("不能编造做了一半");
});
it("跨天重要认识证据不被近期泛泛聊天覆盖，也不从当前位置猜过去地点",()=>{
 const w=createWorld();w.minute=1930;
 const m=rememberPlayer(emptyPlayerMemory(),{id:"first",message:"你好",reply:"你好",source:"fallback",minute:480,worldRevision:0,createdAt:"test"});
 const a:Appointment={id:"meeting",target:"cafe",status:"arrived",reason:"到达",createdMinute:480,updatedMinute:490,arrivedMinute:490,deadlineMinute:1080};
 const messages=buildMessages(w.npcs[1],w,[],"记得我吗",m,[a]),facts=JSON.parse(messages[0].content.split("世界事实：\n")[1]);
 expect(facts.playerRecall).toEqual({firstMeetingDay:1,completedMeeting:null,arrival:a});
 expect(messages[1].content).toContain("不可说之前只打过招呼");expect(messages[1].content).toContain("玩家位置不在后台事实中");
 const other=JSON.parse(buildMessages(w.npcs[1],w,[],"记得我吗")[0].content.split("世界事实：\n")[1]);
 expect(other.playerRecall).toEqual({firstMeetingDay:null,completedMeeting:null,arrival:null});
});
