import {buildingAt,buildingIn,nearPortal,portalById,portalSpawn,validScenePath} from "./scene-data";
import {findScenePath} from "./navigation";
import {activeConversation} from "./social";
import {roadPath,canExecute,execute,worldTime,type World,type Npc,type Decision} from "./world";
import {actionDuration,STEP_MS,STEP_MINUTES} from "./action-time";
import type {PlayerMemory} from "./player-memory";

export type AppointmentStatus="proposed"|"accepted"|"waiting"|"travelling"|"arrived"|"met"|"missed"|"failed"|"cancelled"|"refused"|"deferred";
export type Appointment={id:string;target:"cafe";status:AppointmentStatus;reason:string;createdMinute:number;updatedMinute:number;deadlineMinute:number;arrivedMinute?:number;scheduledMinute?:number;departMinute?:number;waitUntilMinute?:number;confirmedMinute?:number;metMinute?:number;travelMinutes?:number};
export const activeAppointment=(a:Appointment|undefined)=>!!a&&["accepted","waiting","travelling"].includes(a.status);
export function invitationIntent(text:string,npcName?:string):"invite"|"propose"|"confirm"|"cancel"|"status"|"ambiguous"|null {
 const addressed=npcName&&[npcName+"，",npcName+",",npcName+" "].some(prefix=>text.trim().startsWith(prefix))?text.trim().slice(npcName.length+1):text;
 const s=addressed.trim().replace(/[。！？!?，,\s]/g,"");
 if(/^(?:好|好呀|好的|可以|行|没问题)$/.test(s))return "confirm";
 if(/^(?:待会你有空吗)?我想邀请你去(?:麦香)?咖啡馆喝杯咖啡$/.test(s)||/^(?:待会儿?|稍后)(?:我们)?(?:一起)?去(?:麦香)?咖啡馆(?:喝杯咖啡)?(?:吧|好吗|吗)?$/.test(s))return "propose";
 if(/^(?:那)?我们现在就去(?:麦香)?咖啡馆(?:可以吗|好吗|吧)$/.test(s))return "invite";
 if(/^(?:好|好呀|好的|可以)[，,]?(?:就按这个时间|就这个时间|到时见|说定了)$/.test(s)||/^(?:确认这个时间|就按这个时间吧|好就这么定了)$/.test(s))return "confirm";
 if(/^(?:你)?什么时候(?:过来|来|出发)(?:呢|呀)?$|^(?:约好|说好)几点(?:见|来)?$/.test(s))return "status";
 if(/^(?:取消|算了取消)(?:我们)?(?:去咖啡馆的)?(?:约定|邀请|会合)$/.test(s))return "cancel";
 if(/(?:约定|邀请|会合).*(?:怎么样|状态|记得|完成)|(?:记得|还记得).*(?:约定|邀请|会合)|(?:到了|到咖啡馆了吗|到麦香咖啡馆了吗)/.test(s))return "status";
 // Whitelist a small supported language, never execute quoted, negated or compound stories.
 if(/^(?:请问)?(?:我们|咱们|你愿意|你要不要|要不要|能不能|可以|请你|邀请你|我邀请你|我想邀请你|我想请你)?(?:一起|和我|跟我|陪我)?(?:去|到)(?:麦香)?咖啡馆(?:见面|会合|坐坐|喝杯咖啡|喝咖啡|聊聊)?(?:吧|吗|好吗|好不好)?$/.test(s))return "invite";
 if(/^(?:我们|咱们|要不要)?(?:一起|跟我|和我)去(?:吧|吗)?$/.test(s))return "ambiguous";
 return null;
}
// Estimate using the same legal routes, portal transitions and discrete action clock.
// Simulation is a local clone used for planning only; it never settles the actual NPC.
export function cafeTravelMinutes(n:Npc,w:World):number|null {
 let preview=structuredClone(n),minutes=0;
 if(preview.ongoing){const a=preview.ongoing;minutes+=Math.ceil((a.durationMs-a.elapsedMs)/STEP_MS)*STEP_MINUTES;
  const start={...preview,position:a.path[0]??preview.position};delete start.ongoing;
  if(canExecute(start,a.decision.action,w))preview=execute(start,a.decision,w);else return null;
 }
 for(let i=0;i<6&&preview.sceneId!=="cafe_interior";i++){
  const action=cafeAction(preview),path=action.kind==="move"?roadPath(preview,"cafe"):action.kind==="walk-inside"?findScenePath(preview.sceneId,preview.position,portalSpawn(buildingIn(preview.sceneId)!.door,preview.id)):[];
  if(!canExecute(preview,action,w)||(path.length&&!validScenePath(preview.sceneId,path)))return null;
  minutes+=Math.ceil(actionDuration(action.kind,path)/STEP_MS)*STEP_MINUTES;
  preview=execute(preview,{action,reason:"估算咖啡馆合法路程"},w);
 }
 return preview.sceneId==="cafe_interior"?minutes:null;
}
function cafeAction(n:Npc):Decision["action"]{
 const b=buildingIn(n.sceneId),cafe=buildingAt("cafe")!;
 return b?(nearPortal(portalById(b.exit),n.position)?{kind:"exit"}:{kind:"walk-inside",to:"exit"}):n.location==="cafe"&&nearPortal(portalById(cafe.door),n.position)?{kind:"enter"}:{kind:"move",to:"cafe"};
}
export function cafeReachable(n:Npc):boolean {
 const cafe=buildingAt("cafe")!;
 if(n.sceneId==="cafe_interior")return true;
 let start=n.position;
 if(n.sceneId!=="town"){
  const current=buildingIn(n.sceneId);if(!current)return false;
  const route=findScenePath(n.sceneId,start,portalSpawn(current.door,n.id));
  if(!validScenePath(n.sceneId,route))return false;
  start=portalSpawn(current.exit,n.id);
 }
 return validScenePath("town",findScenePath("town",start,portalSpawn(cafe.exit,n.id)));
}
export function assessInvitation(n:Npc,w:World,memory:PlayerMemory):{status:AppointmentStatus;reason:string}{
 if(activeAppointment(n.appointment)||(n.appointment?.status==="arrived"&&w.minute<(n.appointment.waitUntilMinute??(n.appointment.arrivedMinute??0)+60)))return {status:"refused",reason:"我已经有一个会合约定，暂时不能另约。"};
 if(n.energy<=25)return {status:"refused",reason:"现在太累了，等休息好再约吧。"};
 if(n.workTask?.phase==="active"||n.ongoing&&["work","help","rest","eat"].includes(n.ongoing.decision.action.kind))return {status:"deferred",reason:"手头的事还没做完，忙完请再邀请我。"};
 if(n.personality==="quiet"&&memory.meetings===0&&n.mood<35)return {status:"refused",reason:"我们还不熟，我今天想先安静待会儿。"};
 if(!cafeReachable(n))return {status:"refused",reason:"暂时没有通往咖啡馆的安全路线。"};
 return {status:"accepted",reason:w.run?.running?"好，我们在麦香咖啡馆见。":"好，恢复小镇时间后，我去咖啡馆。"};
}
function changed(n:Npc,w:World,status:AppointmentStatus,reason:string){
 const a=n.appointment!;if(a.status===status&&a.reason===reason)return;
 Object.assign(a,{status,reason,updatedMinute:w.minute});
 if(status==="arrived")a.arrivedMinute=w.minute;
 const labels:Partial<Record<AppointmentStatus,string>>={travelling:"正在赶往麦香咖啡馆",arrived:"已到达麦香咖啡馆",missed:"结束咖啡馆等候，未能会面",failed:"未能完成咖啡馆会合",waiting:"暂缓前往咖啡馆"};
 if(labels[status])w.events.push({id:Math.max(w.revision*1000+700,...w.events.map(e=>e.id+1)),minute:w.minute,npcId:n.id,text:`${n.name}${labels[status]}`,reason});
}
export function refreshAppointment(n:Npc,w:World){
 const a=n.appointment;
 if(a?.scheduledMinute!==undefined&&a.status==="arrived"){
  if(w.minute>=(a.waitUntilMinute??a.deadlineMinute))changed(n,w,"missed","等候期限已过，没有收到这位访客的同场景近距离会面确认。");
  else if(n.sceneId!=="cafe_interior")changed(n,w,"failed","紧急事务离开咖啡馆，未能完成会面。");
  return;
 }
 if(!activeAppointment(a))return;
 if(a!.scheduledMinute!==undefined&&w.minute>=a!.deadlineMinute){changed(n,w,"failed","约定期限内未能到达，恢复日常行动。");return;}
 if(n.sceneId==="cafe_interior"&&!n.ongoing&&(a!.scheduledMinute===undefined||n.workTask?.phase!=="active")){changed(n,w,"arrived","已通过合法入口到达；稍候会合，不代表玩家也已到场。");return;}
 if(w.minute>=a!.deadlineMinute){changed(n,w,"failed","约定期限内未能到达，恢复日常行动。");return;}
 if(n.energy<=25||n.hunger>=90||n.workTask?.phase==="active"||activeConversation(w,n.id))changed(n,w,"waiting","先完成重要事务或恢复需求，约定保留。");
}
export function appointmentDecision(n:Npc,w:World):Decision|null {
 const a=n.appointment;if(!a)return null;
 if(a.status==="arrived"&&n.sceneId==="cafe_interior"&&w.minute<(a.waitUntilMinute??(a.arrivedMinute??0)+60)&&n.energy>25&&n.hunger<90)return {action:{kind:"wait"},reason:"已到咖啡馆，短暂等候约定的访客。"};
 if(!activeAppointment(a)||n.energy<=25||n.hunger>=90||n.workTask?.phase==="active")return null;
 if(a.scheduledMinute!==undefined){const travel=cafeTravelMinutes(n,w);if(travel===null){changed(n,w,"failed","没有合法赴约路线。");return null;}
  // Re-evaluate after ordinary actions so a changed origin cannot make the old estimate stale.
  if(w.minute+travel+STEP_MINUTES<a.scheduledMinute)return {action:{kind:"wait"},reason:"约定时间尚早，稍候出发。"};
 }
 const b=buildingIn(n.sceneId);
 const action=cafeAction(n);
 // Validate the route that the existing action executor will actually use.
 const route=action.kind==="move"?roadPath(n,"cafe"):action.kind==="walk-inside"?findScenePath(n.sceneId,n.position,portalSpawn(b!.door,n.id)):null;
 if(!canExecute(n,action,w)||route&&!validScenePath(n.sceneId,route)){changed(n,w,"failed","通行条件改变，无法沿合法路线赴约。");return null;}
 changed(n,w,"travelling","依照已确认的约定前往咖啡馆。");
 return {action,reason:"履行咖啡馆会合约定，沿真实路径前往。"};
}
export function appointmentReply(a:Appointment|undefined):string {
 if(!a)return "我们还没有约过去咖啡馆见面。";
 const time=a.scheduledMinute===undefined?"":worldTime(a.scheduledMinute).replaceAll(" ","").replace("·","");
 const lines:Record<AppointmentStatus,string>={proposed:`还没定时间。${time}，可以吗？`,accepted:time?`说好啦，${time}咖啡馆见！`:"我答应了，接下来去咖啡馆见。",waiting:time?`约好${time}，我先处理急事。`:"约定还在，我先处理手头的急事。",travelling:time?`正赶往咖啡馆，约好${time}。`:"我正在赶往咖啡馆，还没到。",arrived:time?"我到咖啡馆啦，等你呢。":"记得，我按约到了咖啡馆。",met:"记得，我们在咖啡馆按约见过面。",missed:"我等了一阵没见到你，等下次再约吧。",failed:"这次没能按约到达，抱歉。",cancelled:"我们的咖啡馆约定已取消。",refused:a.reason,deferred:a.reason};
 return lines[a.status];
}
