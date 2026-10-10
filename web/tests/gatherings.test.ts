import {expect,it} from "vitest";
import {createWorld,populateResidents} from "../src/lib/world";
import {notifyGathering,assessGathering,type Gathering} from "../src/lib/gatherings";
export const event=(minute=960):Gathering=>({id:"00000000-0000-4000-8000-000000000012",worldId:"test",kind:"gathering",content:"下午四点来广场聊聊",location:"square",createdMinute:780,startMinute:minute,endMinute:minute+60,status:"scheduled",responses:[]});
it("同一公开通知根据需求/性格/工作/既有约定产生不同意向，不读取私人聊天",()=>{
 const w=populateResidents(createWorld());w.minute=780;for(const n of w.npcs){n.energy=80;n.hunger=20;n.mood=75;}
 w.npcs[0].energy=20;const worker=w.npcs.find(n=>n.id==="laolin")!;worker.workTask={id:"work",kind:"store",phase:"active",progress:0,createdMinute:780};
 const a=event();notifyGathering(w,a);expect(new Set(a.responses.map(r=>r.status))).toEqual(new Set(["declined","deferred","accepted"]));expect(a.responses.every(r=>r.notifiedMinute===780)).toBe(true);expect(a.responses.some(r=>r.participatedMinute!==undefined)).toBe(false);
 const n=w.npcs.find(n=>n.id==="aning")!;expect(assessGathering(n,w,a,true).status).toBe("accepted");
 n.appointment={id:"old",target:"cafe",status:"accepted",createdMinute:780,updatedMinute:780,deadlineMinute:1100,reason:"private"};expect(assessGathering(n,w,a,true).status).toBe("declined");expect(n.appointment.reason).toBe("private");
});
