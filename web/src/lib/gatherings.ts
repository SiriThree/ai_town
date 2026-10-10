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
function note(w:World,npcId:string,text:string,reason:string){w.events.push({id:Math.max(w.revision*1000+850,...w.events.map(e=>e.id+1)),minute:w.minute,npcId,text,reason});}
function response(a:Gathering,n:Npc){return a.responses.find(r=>r.npcId===n.id);}
function blocked(n:Npc,w:World){return privateCommitment(n,w)||n.workTask?.phase==="active"||n.energy<=25||n.hunger>=85;}
export function refreshGatherings(w:World){
 for(const a of w.gatherings??[]){
  if(!activeGathering(a))continue;
  if(w.minute>=a.endMinute){
   a.status="ended";
   for(const r of a.responses)if(!["participated","declined","cancelled"].includes(r.status)){r.status="missed";r.updatedMinute=w.minute;r.reason="活动结束，未完成实际参加。";}
   const names=a.responses.filter(r=>r.status==="participated").map(r=>w.npcs.find(n=>n.id===r.npcId)!.name);
   a.result=names.length?`聚会结束，${names.join("、")}实际参加。`:"聚会结束，本次没有居民实际参加。";
   note(w,w.npcs[0].id,a.result,`公开活动 ${a.id}，根据已保存的参加时间结算。`);continue;
  }
  if(w.minute>=a.startMinute)a.status="active";
  for(const n of w.npcs){
   const r=response(a,n);if(!r||["declined","cancelled","missed","participated"].includes(r.status))continue;
   if(blocked(n,w)){
    if(r.status!=="deferred"){r.status="deferred";r.reason="先处理重要事务，聚会若来得及再去。";r.updatedMinute=w.minute;delete r.arrivedMinute;}
    continue;
   }
   if(r.status==="deferred"){
    const next=assessGathering(n,w,a);if(next.status!=="deferred"){Object.assign(r,next,{updatedMinute:w.minute});}else continue;
   }
   if(!["accepted","travelling","arrived"].includes(r.status))continue;
   if(r.status==="arrived"&&!atGathering(n)){r.status="accepted";delete r.arrivedMinute;}
   if(atGathering(n)&&w.minute>=a.startMinute-30&&(!n.ongoing||["wait","read","socialize"].includes(n.ongoing.decision.action.kind))){
    if(r.status!=="arrived"){r.status="arrived";r.arrivedMinute=w.minute;r.updatedMinute=w.minute;r.reason="已到广场，等聚会开始。";note(w,n.id,`${n.name}来到广场等候聚会`,`活动 ${a.id}；到场不等于已经参加。`);}
    if(w.minute>=Math.max(a.startMinute,r.arrivedMinute!)+6){r.status="participated";r.participatedMinute=w.minute;r.updatedMinute=w.minute;r.reason="在活动时间内实际停留，参加了聚会。";note(w,n.id,`${n.name}实际参加广场聚会`,`活动 ${a.id}；已确认同场景、活动区域及停留时间。`);}
   }
  }
 }
}
export function gatheringDecision(n:Npc,w:World):Decision|null{
 const a=w.gatherings?.find(a=>activeGathering(a)&&["accepted","travelling","arrived","participated"].includes(response(a,n)?.status??""));
 if(!a||blocked(n,w))return null;
 const r=response(a,n)!;
 if(atGathering(n)&&w.minute>=a.startMinute-30)return {action:{kind:"wait"},reason:"在广场等候或参加已接受的公共聚会。"};
 const travel=squareTravelMinutes(n,w);
 if(travel===null||w.minute+travel>=a.endMinute-6){r.status="missed";r.reason="当前没有能及时到场的合法路线。";r.updatedMinute=w.minute;return null;}
 if(w.minute+travel+12<a.startMinute)return null;
 const action=squareAction(n);
 if(!canExecute(n,action,w))return null;
 if(r.status!=="travelling"){r.status="travelling";r.reason="我正沿路赶去广场。";r.updatedMinute=w.minute;}
 return {action,reason:"按已接受公告的世界时间，沿真实路线前往广场。"};
}
export function assertGatherings(w:World){
 if(!w.gatherings)return;
 if(!Array.isArray(w.gatherings)||new Set(w.gatherings.map(a=>a.id)).size!==w.gatherings.length)throw Error("活动存档重复");
 for(const a of w.gatherings){
  if(a.kind!=="gathering"||a.location!=="square"||typeof a.content!=="string"||[...a.content].length>120||!["scheduled","active","ended","cancelled"].includes(a.status)||![a.createdMinute,a.startMinute,a.endMinute].every(Number.isSafeInteger)||a.createdMinute>=a.startMinute||a.endMinute!==a.startMinute+60)throw Error("活动存档无效");
  if(new Set(a.responses.map(r=>r.npcId)).size!==a.responses.length)throw Error("重复活动回应");
  for(const r of a.responses)if(!w.npcs.some(n=>n.id===r.npcId)||!["accepted","declined","deferred","travelling","arrived","participated","missed","cancelled"].includes(r.status)||r.participatedMinute!==undefined&&(r.arrivedMinute===undefined||r.participatedMinute<Math.max(a.startMinute,r.arrivedMinute)+6||r.participatedMinute>=a.endMinute||r.participatedMinute>w.minute))throw Error("参加记录缺少真实时间依据");
 }
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
