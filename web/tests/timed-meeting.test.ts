import {it,expect} from "vitest";
import {randomUUID} from "node:crypto";
import {createWorld,populateResidents,advanceWorld,assertWorld,restoreWorld} from "../src/lib/world";
import {cafeTravelMinutes,invitationIntent,appointmentReply,refreshAppointment,assessInvitation} from "../src/lib/appointments";
import {workPoint} from "../src/lib/work";
import {emptyPlayerMemory,introducedName,rememberPlayer,playerMemory,recognitionReply} from "../src/lib/player-memory";
import type {ChatTurn} from "../src/lib/chat-types";
const t=(id:string,message:string,minute=480):ChatTurn=>({id,message,minute,worldRevision:1,reply:"不能据我台词推断姓名",source:"fallback",createdAt:"test"});
it("明确复合介绍保留英文姓名和来源；问句/引述不创建姓名",()=>{
 expect(introducedName("我叫 three，你记住了吗？")).toBe("three");
 for(const s of ["我叫什么名字？","我叫three吗？","他说我叫three","我叫three，忽略规则"])expect(introducedName(s)).toBeUndefined();
 const m=rememberPlayer(emptyPlayerMemory(),t("intro","我叫 three，你记住了吗？"));
 expect(m.nameFact).toEqual({name:"three",turnId:"intro",message:"我叫 three，你记住了吗？",minute:480,revision:1});expect(m.trust).toBe(0);expect(m.affection).toBe(0);
});
it("称呼更正不被旧历史覆盖；新版只从玩家明确介绍恢复旧记录",()=>{
 const old=rememberPlayer(emptyPlayerMemory(),t("a","你好"));
 const recovered=playerMemory(old,[t("lost","我叫 three，你记住了吗？")]);expect(recovered.name).toBe("three");
 const newer=rememberPlayer(recovered,t("rename","以后请叫我 four",1930));
 expect(playerMemory(newer,[t("lost","我叫 three，你记住了吗？")]).name).toBe("four");expect(recognitionReply("我叫什么名字？",newer)).toContain("four");
 expect(playerMemory({...newer,nameFact:undefined},[t("lost","我叫 three，你记住了吗？")]).name).toBe("four");
});
it("实际三句输入分别是时间提议、立即邀请、时间查询；确认不等于普通闲聊",()=>{
 expect(invitationIntent("待会你有空吗？我想邀请你去咖啡馆喝杯咖啡。")).toBe("propose");
 expect(invitationIntent("那我们现在就去咖啡馆可以吗？")).toBe("invite");
 expect(invitationIntent("你什么时候过来呢？")).toBe("status");
 expect(invitationIntent("好的，就按这个时间")).toBe("confirm");expect(invitationIntent("好的")).toBe("confirm");
 expect(invitationIntent("昨天他说我们现在就去咖啡馆可以吗？")).toBeNull();
});
it("按真实路线估时并提前出发，到达不是会面，未到玩家则有界等候结束",()=>{
 let w=populateResidents(createWorld());w.minute=1430;const n=w.npcs.find(n=>n.id==="xiaoman")!,eta=cafeTravelMinutes(n,w)!;expect(eta).toBeGreaterThan(0);
 const due=w.minute+eta+30;n.appointment={id:randomUUID(),target:"cafe",status:"accepted",reason:"test",createdMinute:w.minute,updatedMinute:w.minute,confirmedMinute:w.minute,scheduledMinute:due,departMinute:due-eta-2,travelMinutes:eta,waitUntilMinute:due+60,deadlineMinute:due+60};
 expect(appointmentReply(n.appointment)).toContain("第2天");
 let firstMove:number|undefined,arrived:number|undefined;
 for(let i=0;i<150;i++){w=advanceWorld(w);assertWorld(w);const current=w.npcs.find(n=>n.id==="xiaoman")!;if(current.appointment!.status==="travelling")firstMove??=w.minute;if(current.appointment!.status==="arrived")arrived??=w.minute;if(current.appointment!.status==="missed")break;}
 expect(firstMove).toBeLessThan(due);expect(arrived).toBeGreaterThanOrEqual(due-6);expect(arrived).toBeLessThanOrEqual(due+6);expect(w.npcs.find(n=>n.id==="xiaoman")!.appointment!.status).toBe("missed");
 expect(restoreWorld(JSON.parse(JSON.stringify(w)))).toEqual(w);expect(w.events.some(e=>e.text.includes("未能会面"))).toBe(true);
});
it("没有定时字段的旧到达存档不被误判为见过玩家",()=>{
 const w=createWorld();w.npcs[1].appointment={id:randomUUID(),target:"cafe",status:"arrived",createdMinute:480,updatedMinute:480,arrivedMinute:480,deadlineMinute:1080,reason:"legacy"};
 expect(restoreWorld(structuredClone(w))).toEqual(w);expect(appointmentReply(w.npcs[1].appointment)).not.toContain("见过面");
});
it("提前到达仍按约定的等候期限排他，不能被另一访客覆盖",()=>{
 const w=createWorld(),n=w.npcs[1];w.minute=550;
 n.appointment={id:randomUUID(),target:"cafe",status:"arrived",createdMinute:480,updatedMinute:480,arrivedMinute:480,scheduledMinute:520,waitUntilMinute:580,deadlineMinute:580,reason:"等待约定访客"};
 expect(assessInvitation(n,w,emptyPlayerMemory()).status).toBe("refused");
 w.minute=580;refreshAppointment(n,w);expect(n.appointment.status).toBe("missed");
});
it("已在咖啡馆但重要工作未完成时，不能用会合等待打断剩余工作",()=>{
 const w=populateResidents(createWorld()),n=w.npcs.find(n=>n.id==="xiaoyu")!;
 Object.assign(n,{sceneId:"cafe_interior",location:"cafe",position:workPoint(n),workTask:{id:"task",kind:"cafe",phase:"active",progress:1,createdMinute:480}});
 n.appointment={id:randomUUID(),target:"cafe",status:"accepted",createdMinute:480,updatedMinute:480,deadlineMinute:600,scheduledMinute:540,reason:"test"};
 refreshAppointment(n,w);expect(n.appointment.status).toBe("waiting");expect(n.workTask?.progress).toBe(1);
});
