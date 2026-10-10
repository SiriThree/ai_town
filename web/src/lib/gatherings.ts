import {canExecute,execute,roadPath,type World,type Npc,type Decision} from "./world";
import {buildingIn,nearPortal,portalById,portalSpawn,validScenePath} from "./scene-data";
import {findScenePath} from "./navigation";
import {actionDuration,STEP_MS,STEP_MINUTES} from "./action-time";
import {activeAppointment} from "./appointments";

export type Attendance={npcId:string;status:"accepted"|"declined"|"deferred"|"travelling"|"arrived"|"participated"|"missed"|"cancelled";reason:string;notifiedMinute:number;updatedMinute:number;arrivedMinute?:number;participatedMinute?:number;eventId?:number};
// Public content only. Visitor credentials and private acquaintance stay in SQL.
export type Gathering={id:string;worldId:string;kind:"gathering";content:string;location:"square";createdMinute:number;startMinute:number;endMinute:number;status:"scheduled"|"active"|"ended"|"cancelled";responses:Attendance[];result?:string};
export const activeGathering=(a:Gathering)=>a.status==="scheduled"||a.status==="active";
export function squareAction(n:Npc):Decision["action"]{
 const b=buildingIn(n.sceneId);
 return b?(nearPortal(portalById(b.exit),n.position)?{kind:"exit"}:{kind:"walk-inside",to:"exit"}):{kind:"move",to:"square"};
}
export function atGathering(n:Npc){return n.sceneId==="town"&&n.location==="square"&&!n.ongoing?.path.length&&Math.hypot(n.position.x-480,n.position.y-368)<=110;}
export function squareTravelMinutes(n:Npc,w:World):number|null{
 let p=structuredClone(n),minutes=0;
 if(p.ongoing){const a=p.ongoing;minutes+=Math.ceil((a.durationMs-a.elapsedMs)/STEP_MS)*STEP_MINUTES;const start={...p,position:a.path[0]??p.position};delete start.ongoing;if(!canExecute(start,a.decision.action,w))return null;p=execute(start,a.decision,w);}
 for(let i=0;i<6&&!atGathering(p);i++){
  const action=squareAction(p),b=buildingIn(p.sceneId),path=action.kind==="move"?roadPath(p,"square"):action.kind==="walk-inside"?findScenePath(p.sceneId,p.position,portalSpawn(b!.door,p.id)):[];
  if(!canExecute(p,action,w)||path.length&&!validScenePath(p.sceneId,path))return null;
  minutes+=Math.ceil(actionDuration(action.kind,path)/STEP_MS)*STEP_MINUTES;p=execute(p,{action,reason:"估计广场合法路程"},w);
 }
 return atGathering(p)?minutes:null;
}
export function privateCommitment(n:Npc,w:World){return activeAppointment(n.appointment)||n.appointment?.status==="arrived"&&w.minute<(n.appointment.waitUntilMinute??n.appointment.deadlineMinute);}
export function assessGathering(n:Npc,w:World,a:Gathering,knownPublisher=false):Pick<Attendance,"status"|"reason">{
 if(n.energy<30||n.hunger>=85)return {status:"declined",reason:"今天有点累，我先照顾好自己。"};
 if(privateCommitment(n,w))return {status:"declined",reason:"已有约在先，这次就不参加了。"};
 const travel=squareTravelMinutes(n,w);
 if(travel===null||w.minute+travel>=a.endMinute-6)return {status:"declined",reason:"这次赶不上，等下次再聚吧。"};
 if(n.workTask?.phase==="active"||n.ongoing&&["work","help","rest","eat"].includes(n.ongoing.decision.action.kind))return {status:"deferred",reason:"我还要忙一会儿，忙完再看看。"};
 if(n.personality==="quiet"&&n.mood>=65&&!knownPublisher)return {status:"declined",reason:"今天想安静读书，下次再聊吧。"};
 return {status:"accepted",reason:n.personality==="outgoing"?"好呀，我会按公告时间去广场。":"我愿意去坐坐，听大家聊聊。"};
}
export function notifyGathering(w:World,a:Gathering,known:Record<string,boolean>={}){
 a.responses=w.npcs.map(n=>({npcId:n.id,...assessGathering(n,w,a,known[n.id]),notifiedMinute:w.minute,updatedMinute:w.minute}));
}
export function validateNotice(value:unknown,w:World):{content:string;startMinute:number;location:"square"}{
 const b=value as {content?:unknown;startMinute?:unknown;location?:unknown}|null;
 if(typeof b?.content!=="string"||!b.content.trim()||[...b.content.trim()].length>120||/[\u0000-\u001f]/.test(b.content))throw new Error("公告内容需为1–120字，不含控制字符。");
 if(b.location!=="square")throw new Error("目前只支持树荫广场聚会。");
 if(!Number.isSafeInteger(b.startMinute))throw new Error("请选择明确的世界日期和时间。");
 const start=b.startMinute as number;
 if(start<=w.minute)throw new Error("这个世界时间已经过去，请重新选择。");
 if(start<w.minute+30||start>w.minute+2880)throw new Error("请安排在30游戏分钟后至两天内。");
 return {content:b.content.trim(),startMinute:start,location:"square"};
}
