import {buildingAt,buildingIn,nearPortal,portalById,portalSpawn,validScenePath} from "./scene-data";
import {findScenePath} from "./navigation";
import {activeConversation} from "./social";
import {roadPath,canExecute,type World,type Npc,type Decision} from "./world";
import type {PlayerMemory} from "./player-memory";

export type AppointmentStatus="accepted"|"waiting"|"travelling"|"arrived"|"failed"|"cancelled"|"refused"|"deferred";
export type Appointment={id:string;target:"cafe";status:AppointmentStatus;reason:string;createdMinute:number;updatedMinute:number;deadlineMinute:number;arrivedMinute?:number};
export const activeAppointment=(a:Appointment|undefined)=>!!a&&["accepted","waiting","travelling"].includes(a.status);
export function invitationIntent(text:string,npcName?:string):"invite"|"cancel"|"status"|"ambiguous"|null {
 const addressed=npcName&&[npcName+"，",npcName+",",npcName+" "].some(prefix=>text.trim().startsWith(prefix))?text.trim().slice(npcName.length+1):text;
 const s=addressed.trim().replace(/[。！？!?，,\s]/g,"");
 if(/^(?:取消|算了取消)(?:我们)?(?:去咖啡馆的)?(?:约定|邀请|会合)$/.test(s))return "cancel";
 if(/(?:约定|邀请|会合).*(?:怎么样|状态|记得|完成)|(?:记得|还记得).*(?:约定|邀请|会合)|(?:到了|到咖啡馆了吗|到麦香咖啡馆了吗)/.test(s))return "status";
 // Whitelist a small supported language, never execute quoted, negated or compound stories.
 if(/^(?:请问)?(?:我们|咱们|你愿意|你要不要|要不要|能不能|可以|请你|邀请你|我邀请你|我想邀请你|我想请你)?(?:一起|和我|跟我|陪我)?(?:去|到)(?:麦香)?咖啡馆(?:见面|会合|坐坐|喝杯咖啡|喝咖啡|聊聊)?(?:吧|吗|好吗|好不好)?$/.test(s))return "invite";
 if(/^(?:我们|咱们|要不要)?(?:一起|跟我|和我)去(?:吧|吗)?$/.test(s))return "ambiguous";
 return null;
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
 if(activeAppointment(n.appointment)||(n.appointment?.status==="arrived"&&w.minute<(n.appointment.arrivedMinute??0)+60))return {status:"refused",reason:"我已经有一个会合约定，暂时不能另约。"};
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
 const labels:Partial<Record<AppointmentStatus,string>>={travelling:"正在赶往麦香咖啡馆",arrived:"已到达麦香咖啡馆",failed:"未能完成咖啡馆会合",waiting:"暂缓前往咖啡馆"};
 if(labels[status])w.events.push({id:Math.max(w.revision*1000+700,...w.events.map(e=>e.id+1)),minute:w.minute,npcId:n.id,text:`${n.name}${labels[status]}`,reason});
}
export function refreshAppointment(n:Npc,w:World){
 const a=n.appointment;if(!activeAppointment(a))return;
 if(n.sceneId==="cafe_interior"&&!n.ongoing){changed(n,w,"arrived","已通过合法入口到达；稍候会合，不代表玩家也已到场。");return;}
 if(w.minute>=a!.deadlineMinute){changed(n,w,"failed","约定期限内未能到达，恢复日常行动。");return;}
 if(n.energy<=25||n.hunger>=90||n.workTask?.phase==="active"||activeConversation(w,n.id))changed(n,w,"waiting","先完成重要事务或恢复需求，约定保留。");
}
export function appointmentDecision(n:Npc,w:World):Decision|null {
 const a=n.appointment;if(!a)return null;
 if(a.status==="arrived"&&n.sceneId==="cafe_interior"&&w.minute<(a.arrivedMinute??0)+60&&n.energy>25&&n.hunger<90)return {action:{kind:"wait"},reason:"已到咖啡馆，短暂等候约定的访客。"};
 if(!activeAppointment(a)||n.energy<=25||n.hunger>=90||n.workTask?.phase==="active")return null;
 const b=buildingIn(n.sceneId),cafe=buildingAt("cafe")!;
 const action:Decision["action"]=b?(nearPortal(portalById(b.exit),n.position)?{kind:"exit"}:{kind:"walk-inside",to:"exit"}):n.location==="cafe"&&nearPortal(portalById(cafe.door),n.position)?{kind:"enter"}:{kind:"move",to:"cafe"};
 // Validate the route that the existing action executor will actually use.
 const route=action.kind==="move"?roadPath(n,"cafe"):action.kind==="walk-inside"?findScenePath(n.sceneId,n.position,portalSpawn(b!.door,n.id)):null;
 if(!canExecute(n,action,w)||route&&!validScenePath(n.sceneId,route)){changed(n,w,"failed","通行条件改变，无法沿合法路线赴约。");return null;}
 changed(n,w,"travelling","依照已确认的约定前往咖啡馆。");
 return {action,reason:"履行咖啡馆会合约定，沿真实路径前往。"};
}
export function appointmentReply(a:Appointment|undefined):string {
 if(!a)return "我们还没有约过去咖啡馆见面。";
 const lines:Record<AppointmentStatus,string>={accepted:"我答应了，接下来去咖啡馆见。",waiting:"约定还在，我先处理手头的急事。",travelling:"我正在赶往咖啡馆，还没到。",arrived:"记得，我按约到了咖啡馆。",failed:"这次没能按约到达，抱歉。",cancelled:"我们的咖啡馆约定已取消。",refused:a.reason,deferred:a.reason};
 return lines[a.status];
}
