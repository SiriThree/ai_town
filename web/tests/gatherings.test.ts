import {expect,it} from "vitest";
import {createWorld,populateResidents,advanceWorld,assertWorld,restoreWorld} from "../src/lib/world";
import {notifyGathering,assessGathering,refreshGatherings,gatheringKnowledge,gatheringRecall,type Gathering} from "../src/lib/gatherings";
import {recordExperience} from "../src/lib/experiences";
import {validScenePath} from "../src/lib/scene-data";
export const event=(minute=960):Gathering=>({id:"00000000-0000-4000-8000-000000000012",worldId:"test",kind:"gathering",content:"下午四点来广场聊聊",location:"square",createdMinute:780,startMinute:minute,endMinute:minute+60,status:"scheduled",responses:[]});
it("同一公开通知根据需求/性格/工作/既有约定产生不同意向，不读取私人聊天",()=>{
 const w=populateResidents(createWorld());w.minute=780;for(const n of w.npcs){n.energy=80;n.hunger=20;n.mood=75;}
 w.npcs[0].energy=20;const worker=w.npcs.find(n=>n.id==="laolin")!;worker.workTask={id:"work",kind:"store",phase:"active",progress:0,createdMinute:780};
 const a=event();notifyGathering(w,a);expect(new Set(a.responses.map(r=>r.status))).toEqual(new Set(["declined","deferred","accepted"]));expect(a.responses.every(r=>r.notifiedMinute===780)).toBe(true);expect(a.responses.some(r=>r.participatedMinute!==undefined)).toBe(false);
 const n=w.npcs.find(n=>n.id==="aning")!;expect(assessGathering(n,w,a,true).status).toBe("accepted");
 n.appointment={id:"old",target:"cafe",status:"accepted",createdMinute:780,updatedMinute:780,deadlineMinute:1100,reason:"private"};expect(assessGathering(n,w,a,true).status).toBe("declined");expect(n.appointment.reason).toBe("private");
});
it("从公告意向沿原引擎行走，开始后真实停留才参加，结束有结果且存档可恢复",()=>{
 let w=populateResidents(createWorld());w.minute=780;for(const n of w.npcs){n.energy=85;n.hunger=15;n.mood=n.personality==="quiet"?90:60;}
 const a=event();notifyGathering(w,a);w.gatherings=[a];let travelled=false,arrived=false;
 for(let i=0;i<125;i++){
  w=advanceWorld(w);assertWorld(w);for(const n of w.npcs)if(n.lastPath.length)expect(validScenePath(n.sceneId,n.lastPath)).toBe(true);
  const current=w.gatherings![0];travelled||=current.responses.some(r=>r.status==="travelling");arrived||=current.responses.some(r=>r.status==="arrived");
  if(w.minute<966)expect(current.responses.every(r=>r.participatedMinute===undefined)).toBe(true);
 }
 const result=w.gatherings![0];expect(travelled).toBe(true);expect(arrived).toBe(true);expect(result.status).toBe("ended");expect(result.responses.some(r=>r.status==="participated")).toBe(true);
 expect(result.responses.filter(r=>r.status==="declined").every(r=>r.participatedMinute===undefined)).toBe(true);expect(restoreWorld(JSON.parse(JSON.stringify(w)))).toEqual(w);
 for(const r of result.responses){const n=w.npcs.find(n=>n.id===r.npcId)!;const facts=gatheringKnowledge(w,n).firsthandFacts;expect(facts.some(f=>f.key===`gathering:${a.id}:${n.id}`)).toBe(r.status==="participated");}
 const participant=result.responses.find(r=>r.status==="participated")!;w.minute=1440+480;expect(gatheringRecall(w.npcs.find(n=>n.id===participant.npcId)!,w,"昨天聚会还记得吗？")).toContain("参加过");
});
it("路过或已取消活动不计参加，错过期限明确结算",()=>{
 const w=populateResidents(createWorld());w.minute=960;const a=event();w.gatherings=[a];notifyGathering(w,a);a.responses[0].status="declined";
 refreshGatherings(w);expect(a.responses[0].participatedMinute).toBeUndefined();
 a.status="cancelled";w.minute=970;refreshGatherings(w);expect(a.responses.every(r=>r.participatedMinute===undefined)).toBe(true);
 a.status="active";a.responses[0].status="travelling";w.minute=1020;refreshGatherings(w);expect(a.responses[0].status).toBe("missed");
});
it("共同参加本身不增加关系，只有原交流机制的实际交谈可以留下关系来源",()=>{
 const w=populateResidents(createWorld());const n=w.npcs[0];const before=structuredClone(w.experiences?.relations??[]);
 recordExperience(w,[n.id],"gathering","fixture:participated","实际停留参加");expect(w.experiences?.relations).toEqual(before);
 expect(w.experiences?.memories[n.id][0].opinion).toContain("我的感受");
});
it("实际参加者后来离场不会被改写成没参加",()=>{
 const w=populateResidents(createWorld());w.minute=970;const a=event();w.gatherings=[a];notifyGathering(w,a);const n=w.npcs[0],r=a.responses[0];
 Object.assign(r,{status:"participated",arrivedMinute:958,participatedMinute:966});n.location="home";n.sceneId="home_interior";n.position={x:460,y:486};
 refreshGatherings(w);expect(r.status).toBe("participated");expect(r.departedMinute).toBe(970);
 w.minute=1020;refreshGatherings(w);expect(r.status).toBe("participated");expect(a.result).toContain(n.name);
});
