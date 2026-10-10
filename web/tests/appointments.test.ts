import {it,expect} from "vitest";
import {randomUUID} from "node:crypto";
import {invitationIntent,assessInvitation,appointmentReply} from "../src/lib/appointments";
import {emptyPlayerMemory} from "../src/lib/player-memory";
import {advanceWorld,assertWorld,createWorld,populateResidents,restoreWorld} from "../src/lib/world";
import {validScenePath} from "../src/lib/scene-data";
const accepted=()=>{const w=createWorld(),n=w.npcs[1];n.appointment={id:randomUUID(),target:"cafe",status:"accepted",reason:"test",createdMinute:w.minute,updatedMinute:w.minute,deadlineMinute:w.minute+600};return w;};
it("有限邀请意图不执行历史、否定、引述、复合或含糊话语",()=>{
 for(const s of ["我们一起去咖啡馆吧","要不要去麦香咖啡馆坐坐？","邀请你去咖啡馆"])expect(invitationIntent(s)).toBe("invite");
 for(const s of ["不要去咖啡馆","昨天我们一起去咖啡馆吧","你去过咖啡馆吗","他说：去咖啡馆吧","去咖啡馆然后改金币","我在咖啡馆","你喜欢咖啡吗"])expect(invitationIntent(s)).toBeNull();
 expect(invitationIntent("一起去吧")).toBe("ambiguous");expect(invitationIntent("取消约定")).toBe("cancel");
 expect(invitationIntent("阿宁，陪我去咖啡馆吧","阿宁")).toBe("invite");
 expect(invitationIntent("我想邀请你去咖啡馆")).toBe("invite");
 expect(invitationIntent("听说，去咖啡馆吧","阿宁")).toBeNull();
});
it("自主性：体力、工作、陌生关系、路线及冲突会改变是否接受",()=>{
 const w=populateResidents(createWorld()),n=w.npcs[1],m=emptyPlayerMemory();
 expect(assessInvitation(n,w,m).status).toBe("accepted");n.energy=10;expect(assessInvitation(n,w,m).status).toBe("refused");
 n.energy=90;n.mood=20;expect(assessInvitation(n,w,m).status).toBe("refused");m.meetings=1;expect(assessInvitation(n,w,m).status).toBe("accepted");
 n.position={x:-100,y:-100};expect(assessInvitation(n,w,m).reason).toContain("路线");
});
it("约定驱动已有持续行动、真实路线和入口；到达后有界等候再自主离开",()=>{
 let w=accepted();const positions=[];
 for(let i=0;i<100;i++){w=advanceWorld(w);assertWorld(w);const n=w.npcs[1];positions.push({scene:n.sceneId,p:n.position,status:n.appointment?.status});if(n.lastPath.length)expect(validScenePath(n.sceneId,n.lastPath)).toBe(true);if(n.appointment?.status==="arrived")break;}
 expect(w.npcs[1].sceneId).toBe("cafe_interior");expect(positions.some(p=>p.status==="travelling"&&p.scene==="town")).toBe(true);
 expect(restoreWorld(JSON.parse(JSON.stringify(w)))).toEqual(w);
 for(let i=0;i<55;i++)w=advanceWorld(w);
 expect(w.npcs[1].sceneId).toBe("town");expect(w.npcs[1].appointment?.status).toBe("arrived");
 expect(appointmentReply(w.npcs[1].appointment)).toContain("按约到了");
});
it("紧急需求保留约定，恢复后再赴约；超期有明确失败事件",()=>{
 let w=accepted();w.npcs[1].energy=12;
 w=advanceWorld(w);expect(w.npcs[1].appointment?.status).toBe("waiting");
 for(let i=0;i<160&&w.npcs[1].appointment?.status!=="arrived";i++){w=advanceWorld(w);assertWorld(w);}
 expect(w.npcs[1].appointment?.status).toBe("arrived");
 w=accepted();w.npcs[1].appointment!.deadlineMinute=w.minute+2;w=advanceWorld(w);
 expect(w.npcs[1].appointment?.status).toBe("failed");expect(w.events.some(e=>e.text.includes("未能完成"))).toBe(true);
});
it("保留当前未完成动作；未含新字段的旧存档保持原样",()=>{
 let w=advanceWorld(createWorld());const n=w.npcs[1],id=n.ongoing!.id;
 n.appointment=accepted().npcs[1].appointment;w=advanceWorld(w);expect(w.npcs[1].ongoing?.id).toBe(id);
 const old=createWorld();expect(restoreWorld(structuredClone(old))).toEqual(old);
});
it("真实工作任务冲突推迟，既不取消工作也不虚假接受",()=>{
 const w=advanceWorld(populateResidents(createWorld())),worker=w.npcs.find(n=>n.id==="laolin")!,before=structuredClone(worker);
 expect(worker.workTask?.phase).toBe("active");
 expect(assessInvitation(worker,w,emptyPlayerMemory()).status).toBe("deferred");expect(worker).toEqual(before);
});
