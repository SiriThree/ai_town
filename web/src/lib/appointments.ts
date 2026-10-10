import {buildingAt,buildingIn,nearPortal,portalById,portalSpawn,validScenePath} from "./scene-data";
import {findScenePath} from "./navigation";
import {activeConversation} from "./social";
import {roadPath,canExecute,execute,worldTime,type World,type Npc,type Decision,type LocationId} from "./world";
import {atMeetingPlace,meetingAccess,meetingName} from './meeting-places';
import {actionDuration,STEP_MS,STEP_MINUTES} from "./action-time";
import type {PlayerMemory} from "./player-memory";
import type {MeetingTime} from "./meeting-language";
import {nextPlanAction,waitsForPlayer,GOAL_RECIPES,type GoalKind,type GoalPlan} from './goal-plan';

export type AppointmentStatus="proposed"|"accepted"|"waiting"|"travelling"|"arrived"|"executing"|"completed"|"met"|"missed"|"failed"|"cancelled"|"refused"|"deferred";
export type Appointment={id:string;target:LocationId;status:AppointmentStatus;reason:string;createdMinute:number;updatedMinute:number;deadlineMinute:number;arrivedMinute?:number;scheduledMinute?:number;departMinute?:number;waitUntilMinute?:number;confirmedMinute?:number;metMinute?:number;travelMinutes?:number;requestedTime?:MeetingTime|null;proposalOrigin?:'player'|'npc';goal?:GoalKind;plan?:GoalPlan};
export const activeAppointment=(a:Appointment|undefined)=>!!a&&["accepted","waiting","travelling","executing"].includes(a.status);
export type InvitationIntent="invite"|"propose"|"negotiate"|"schedule"|"confirm"|"cancel"|"status"|"ambiguous"|"clarify"|null;
const NUMBER="[0-9零〇一二两三四五六七八九十]{1,3}";
const CLOCK=`(?:(今天|明天|后天))?(上午|下午|晚上|中午|早上|凌晨)?(${NUMBER})(?:点(?:(半)|(${NUMBER})分?)?|[:：](\\d{2}))`;
function numeral(s:string){if(/^\d+$/.test(s))return Number(s);const digits:Record<string,number>={零:0,〇:0,一:1,二:2,两:2,三:3,四:4,五:5,六:6,七:7,八:8,九:9};if(s.includes('十')){const [a,b]=s.split('十');return (a?digits[a]:1)*10+(b?digits[b]:0);}return digits[s]??NaN;}
/** World-clock parser, not a wall-clock Date and never silently rolls a past time to tomorrow. */
export function invitationTime(text:string,minute:number):{minute?:number;error?:string}{
 const match=new RegExp(CLOCK).exec(text.replace(/\s/g,""));if(!match)return {error:"请说清世界时间，例如今天下午两点。"};
 let hour=numeral(match[3]);const minutes=match[4]?30:numeral(match[5]??match[6]??"0");
 const period=match[2];if(!Number.isInteger(hour)||!Number.isInteger(minutes)||minutes<0||minutes>59||hour>23||hour<0||period&&hour>12)return {error:"这个时间不明确，请用今天14:00这样的时间。"};
 if(["下午","晚上"].includes(period)&&hour<12)hour+=12;
 if(period==="中午"&&hour<11)hour+=12;
 if(["上午","早上","凌晨"].includes(period)&&hour===12)hour=0;
 const day=match[1]==="明天"?1:match[1]==="后天"?2:0;
 const target=Math.floor(minute/1440)*1440+day*1440+hour*60+minutes;
 return target<=minute?{error:"这个世界时间已过去，请另选时间或说明明天。"}:{minute:target};
}
export function invitationIntent(text:string,npcName?:string):InvitationIntent {
 const addressed=npcName&&[npcName+"，",npcName+",",npcName+" "].some(prefix=>text.trim().startsWith(prefix))?text.trim().slice(npcName.length+1):text;
 const s=addressed.trim().replace(/[。！？!?，,\s]/g,"");
 if(!s&&/[？?]/.test(text))return "clarify";
 if(/^(?:那)?我(?:现在)?约你$/.test(s))return "ambiguous";
 if(new RegExp(`^(?:那)?(?:(?:我们|咱们)(?:约)?|我(?:现在)?(?:邀请你|约你))?${CLOCK}(?:(?:一起)?(?:在|去|到)?(?:麦香)?咖啡馆)?(?:见面|会合|喝杯咖啡|喝咖啡)?(?:可以吗|好吗|好不好|怎么样|如何|行吗|行不行|吧|吗)?$`).test(s))return "schedule";
 // “现在可以邀请” asks permission now, not necessarily departure now. Keep the time open.
 if(/^(?:请问)?我(?:现在)?(?:可以|能|能不能|可不可以)邀请你(?:一起)?去(?:麦香)?咖啡馆(?:喝杯咖啡|喝咖啡|见面)?(?:吗|可以吗|好吗|怎么样)?$/.test(s))return "negotiate";
 if(/^(?:我们|咱们)?(?:能|可以)?(?:一起|和我|陪我)?去(?:麦香)?咖啡馆(?:喝杯咖啡|喝咖啡|见面)?(?:吗|可以吗|好吗)$/.test(s)&&!s.includes("现在"))return "negotiate";
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
export function meetingTravelMinutes(n:Npc,w:World,target:LocationId):number|null {
 if(meetingAccess(target,n,w))return null;
 let preview=structuredClone(n),minutes=0;
 if(preview.ongoing){const a=preview.ongoing;minutes+=Math.ceil((a.durationMs-a.elapsedMs)/STEP_MS)*STEP_MINUTES;
  const start={...preview,position:a.path[0]??preview.position};delete start.ongoing;
  if(canExecute(start,a.decision.action,w))preview=execute(start,a.decision,w);else return null;
 }
 for(let i=0;i<6&&!atMeetingPlace(preview,target);i++){
  const action=meetingAction(preview,target),path=action.kind==="move"?roadPath(preview,target):action.kind==="walk-inside"?findScenePath(preview.sceneId,preview.position,portalSpawn(buildingIn(preview.sceneId)!.door,preview.id)):[];
  if(!canExecute(preview,action,w)||(path.length&&!validScenePath(preview.sceneId,path)))return null;
  minutes+=Math.ceil(actionDuration(action.kind,path)/STEP_MS)*STEP_MINUTES;
  preview=execute(preview,{action,reason:"估算约定地点合法路程"},w);
 }
 return atMeetingPlace(preview,target)?minutes:null;
}
// Compatibility exports for old fixtures, not separate handlers or movement code.
export const cafeTravelMinutes=(n:Npc,w:World)=>meetingTravelMinutes(n,w,'cafe');
function meetingAction(n:Npc,target:LocationId):Decision["action"]{
 const current=buildingIn(n.sceneId),destination=buildingAt(target);
 if(current){if(current.location===target)return {kind:'walk-inside',to:'exit'};return nearPortal(portalById(current.exit),n.position)?{kind:'exit'}:{kind:'walk-inside',to:'exit'};}
 return destination&&n.location===target&&nearPortal(portalById(destination.door),n.position)?{kind:'enter'}:{kind:'move',to:target};
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
export function assessInvitation(n:Npc,w:World,memory:PlayerMemory,target:LocationId='cafe'):{status:AppointmentStatus;reason:string}{
 const denied=meetingAccess(target,n,w);if(denied)return {status:'refused',reason:denied};
 if(activeAppointment(n.appointment)||(n.appointment?.status==="arrived"&&w.minute<(n.appointment.waitUntilMinute??(n.appointment.arrivedMinute??0)+60)))return {status:"refused",reason:"我已经有一个会合约定，暂时不能另约。"};
 if(n.energy<=25)return {status:"refused",reason:"现在太累了，等休息好再约吧。"};
 if(n.workTask?.phase==="active"||n.ongoing&&["work","help","rest","eat"].includes(n.ongoing.decision.action.kind))return {status:"deferred",reason:"手头的事还没做完，忙完请再邀请我。"};
 if(n.personality==="quiet"&&memory.meetings===0&&n.mood<35)return {status:"refused",reason:"我们还不熟，我今天想先安静待会儿。"};
 if(meetingTravelMinutes(n,w,target)===null)return {status:'refused',reason:'暂时没有通往约定地点的安全路线。'};
 return {status:'accepted',reason:`好，我们在${meetingName(target)}见。`};
}
function changed(n:Npc,w:World,status:AppointmentStatus,reason:string){
 const a=n.appointment!;if(a.status===status&&a.reason===reason)return;
 Object.assign(a,{status,reason,updatedMinute:w.minute});
 if(status==="arrived")a.arrivedMinute=w.minute;
 const place=meetingName(a.target);
 const labels:Partial<Record<AppointmentStatus,string>>={travelling:`正在赶往${place}`,arrived:`已到达${place}`,missed:`结束${place}等候，未能会面`,failed:`未能完成${place}会合`,waiting:`暂缓前往${place}`};
 if(labels[status])w.events.push({id:Math.max(w.revision*1000+700,...w.events.map(e=>e.id+1)),minute:w.minute,npcId:n.id,text:`${n.name}${labels[status]}`,reason});
}
export function refreshAppointment(n:Npc,w:World){
 const a=n.appointment;
 if(a?.status==='executing'){
  if(w.minute>=a.deadlineMinute)changed(n,w,'failed','目标到期，未完成的行动不算成功。');
  return;
 }
 if(a?.scheduledMinute!==undefined&&a.status==="arrived"){
  if(w.minute>=(a.waitUntilMinute??a.deadlineMinute))changed(n,w,"missed","等候期限已过，没有收到这位访客的同场景近距离会面确认。");
  else if(!atMeetingPlace(n,a.target))changed(n,w,"failed","紧急事务离开约定地点，未能完成会面。");
  return;
 }
 if(!activeAppointment(a))return;
 if(a!.scheduledMinute!==undefined&&w.minute>=a!.deadlineMinute){changed(n,w,"failed","约定期限内未能到达，恢复日常行动。");return;}
 if(atMeetingPlace(n,a!.target)&&!n.ongoing&&(a!.scheduledMinute===undefined||n.workTask?.phase!=="active")){
  if(a!.plan&&!waitsForPlayer(a!.plan)){if(w.minute<(a!.scheduledMinute??w.minute))return;a!.arrivedMinute??=w.minute;a!.plan.cursor=Math.max(1,a!.plan.cursor);changed(n,w,'executing','已合法到达，接下来执行计划中的基础行动。');}
  else {if(a!.plan)a!.plan.cursor=1;changed(n,w,"arrived","已合法到达约定区域；稍候会合，不代表玩家也已到场。");}return;
 }
 if(w.minute>=a!.deadlineMinute){changed(n,w,"failed","约定期限内未能到达，恢复日常行动。");return;}
 if(n.energy<=25||n.hunger>=90||n.workTask?.phase==="active"||activeConversation(w,n.id))changed(n,w,"waiting","先完成重要事务或恢复需求，约定保留。");
}
export function appointmentDecision(n:Npc,w:World):Decision|null {
 const a=n.appointment;if(!a)return null;
 if(a.status==='executing'){
  if(n.energy<=25||n.hunger>=90||n.workTask?.phase==='active'){changed(n,w,'waiting','先处理紧急需求或既有工作，目标保留。');return null;}
  const decision=nextPlanAction(n,w);if(decision)return decision;
  changed(n,w,'failed','计划所需的在场对象、权限或工作已经变化。');return null;
 }
 if(a.status==="arrived"&&atMeetingPlace(n,a.target)&&w.minute<(a.waitUntilMinute??(a.arrivedMinute??0)+60)&&n.energy>25&&n.hunger<90)return {action:{kind:"wait"},reason:"已到约定区域，短暂等候约定的访客。"};
 if(!activeAppointment(a)||n.energy<=25||n.hunger>=90||n.workTask?.phase==="active")return null;
 if(a.scheduledMinute!==undefined){const travel=meetingTravelMinutes(n,w,a.target);if(travel===null){changed(n,w,"failed","没有合法赴约路线。");return null;}
  // Re-evaluate after ordinary actions so a changed origin cannot make the old estimate stale.
  if(w.minute+travel+STEP_MINUTES<a.scheduledMinute)return {action:{kind:"wait"},reason:"约定时间尚早，稍候出发。"};
 }
 const b=buildingIn(n.sceneId);
 const action=meetingAction(n,a.target);
 // Validate the route that the existing action executor will actually use.
 const route=action.kind==="move"?roadPath(n,a.target):action.kind==="walk-inside"?findScenePath(n.sceneId,n.position,portalSpawn(b!.door,n.id)):null;
 if(!canExecute(n,action,w)||route&&!validScenePath(n.sceneId,route)){changed(n,w,"failed","通行条件改变，无法沿合法路线赴约。");return null;}
 changed(n,w,"travelling",`依照已确认的约定前往${meetingName(a.target)}。`);
 return {action,reason:"履行会合约定，沿真实路径前往。"};
}
export function appointmentReply(a:Appointment|undefined):string {
 if(!a)return "我们还没有确认的安排。";
 if(a.goal&&!waitsForPlayer(a.plan)){
  const where=meetingName(a.target),when=a.scheduledMinute===undefined?'待商量':worldTime(a.scheduledMinute);
  if(['refused','deferred','failed','cancelled'].includes(a.status))return a.reason;
  if(a.status==='completed')return `在${where}的${GOAL_RECIPES[a.goal].label}已完成，有实际执行记录。`;
  if(a.status==='executing')return `已经到${where}，正在执行约好的行动。`;
  if(a.status==='proposed')return `${where}的安排还没确认，时间${when}。`;
  return `已约好${when}在${where}${GOAL_RECIPES[a.goal].label}。`;
 }
 const time=a.scheduledMinute===undefined?"":worldTime(a.scheduledMinute).replaceAll(" ","").replace("·","");
 const lines:Record<AppointmentStatus,string>={executing:"正在执行约好的行动。",completed:"约好的行动已有完成记录。",proposed:time?`还未确认。${time}咖啡馆见，可以吗？`:"去麦香咖啡馆的时间还没定，你想几点见？",accepted:time?`说好啦，${time}咖啡馆见！`:"我答应了，接下来去咖啡馆见。",waiting:time?`约好${time}，我先处理急事。`:"约定还在，我先处理手头的急事。",travelling:time?`正赶往咖啡馆，约好${time}。`:"我正在赶往咖啡馆，还没到。",arrived:time?"我到咖啡馆啦，等你呢。":"记得，我按约到了咖啡馆。",met:"记得，我们在咖啡馆按约见过面。",missed:"我等了一阵没见到你，等下次再约吧。",failed:"这次没能按约到达，抱歉。",cancelled:"我们的咖啡馆约定已取消。",refused:a.reason,deferred:a.reason};
 return a.target==='cafe'?lines[a.status]:lines[a.status].replaceAll('麦香咖啡馆',meetingName(a.target)).replaceAll('咖啡馆',meetingName(a.target));
}
