import {invitationIntent,type Appointment} from "./appointments";
import type {ChatReply,ChatTurn} from "./chat-types";
import type {Npc,World} from "./world";

export function recallRequest(message:string){
 const absolute=/第\s*(\d+)\s*天/.exec(message);
 const day=absolute?Number(absolute[1]):null;
 const relative= /前天/.test(message)?-2:/昨天|昨日/.test(message)?-1:/今天|今日/.test(message)?0:null;
 return {day:day===null?null:Number.isSafeInteger(day)&&day>0&&day<=2147483647?day:-1,relative,
  recalling:/记得|回忆|昨天|昨日|前天|之前|经历|当时|说了什么|为什么来|第\s*\d+\s*天/.test(message)};
}
export type InvitationSource={appointment:Appointment;confirmation:Pick<ChatTurn,"id"|"message"|"minute"|"worldRevision">&{confirmation?:{turn:ChatTurn};meetingEvidence?:{minute:number}}};
export type PlayerFact={sourceTable:"town_invitations";sourceId:string;turnId:string;kind:"proposed"|"invited"|"arrived"|"met"|"missed"|"cancelled"|"failed"|"refused"|"deferred";minute:number;result:string;target:"cafe"};
export type PlayerRecall={requestedDay:number|null;events:PlayerFact[]};
// Sources are already scoped to world + NPC + signed visitor by the SQL reader.
// A cancelled-request receipt is not evidence that a second invitation was accepted.
export function retrievePlayerFacts(sources:InvitationSource[],message:string,minute:number,npcName?:string):PlayerRecall {
 const request=recallRequest(message),requestedDay=request.day??(request.relative===null?null:Math.floor(minute/1440)+1+request.relative);
 const events:PlayerFact[]=[];
 for(const {appointment:a,confirmation:c} of sources){
  if(c.minute!==a.createdMinute||!c.id||!a.id)continue;
  const intent=invitationIntent(c.message,npcName);
  const push=(kind:PlayerFact["kind"],time:number,result:string,turnId=c.id)=>{
   if(!Number.isSafeInteger(time)||time<c.minute||time>minute)return;
   if(requestedDay!==null&&Math.floor(time/1440)+1!==requestedDay)return;
   events.push({sourceTable:"town_invitations",sourceId:a.id,turnId,kind,minute:time,result,target:"cafe"});
  };
  if(intent==="cancel"){if(a.status==="cancelled")push("cancelled",a.updatedMinute,"这位访客取消会合");continue;}
  if(intent!=="invite"&&intent!=="propose")continue;
  if(a.status==="refused"||a.status==="deferred"){push(a.status,c.minute,a.reason);continue;}
  if(intent==="propose")push("proposed",c.minute,"这位访客提议喝咖啡，单凭提议不算已确认");
  if(intent==="invite"||a.confirmedMinute!==undefined&&c.confirmation?.turn.minute===a.confirmedMinute)push("invited",a.confirmedMinute??c.minute,"这位访客邀请NPC去麦香咖啡馆，后台确认接受",c.confirmation?.turn.id??c.id);
  if(a.arrivedMinute!==undefined)push("arrived",a.arrivedMinute,"NPC已通过合法入口赴约到达；不证明玩家也到场");
  if(a.status==="met"&&a.metMinute!==undefined&&c.meetingEvidence?.minute===a.metMinute)push("met",a.metMinute,"这位访客在咖啡馆发起近距离交流，后台校验同场景合法位置及距离，双方实际会面");
  if(a.status==="missed")push("missed",a.updatedMinute,a.reason);
  if(a.status==="cancelled"||a.status==="failed")push(a.status,a.updatedMinute,a.reason);
 }
 // Return chronological evidence, not a transcript or invented event ID.
 return {requestedDay,events:events.sort((a,b)=>a.minute-b.minute||a.sourceId.localeCompare(b.sourceId)||(a.kind==="proposed"?0:a.kind==="invited"?1:2)-(b.kind==="proposed"?0:b.kind==="invited"?1:2))};
}

export function recallFallback(recall:PlayerRecall):string|undefined {
 if(recall.events.some(e=>e.kind==="met"))return "记得，你约我喝咖啡，我们后来确实见面了。";
 if(recall.events.some(e=>e.kind==="missed"))return "那次我到咖啡馆等过，但没能和你碰面。";
 const invitation=recall.events.find(e=>e.kind==="invited"),arrival=recall.events.find(e=>e.kind==="arrived");
 if(arrival)return invitation?"是你约我去咖啡馆的，我确实按约到过。":"记得，我曾按约到达咖啡馆。";
 const ended=recall.events.find(e=>e.kind==="cancelled"||e.kind==="failed");
 if(ended)return ended.kind==="cancelled"?"记得，那次咖啡馆约定后来取消了。":"记得，那次咖啡馆约定没能完成。";
 if(invitation)return "记得，你曾约我去咖啡馆；还没有赴约完成记录。";
 if(recall.requestedDay!==null)return "那天没有可核实的约定经历，我不能凭空回忆。";
}

/** Narrow conflict guard, not a general semantic judge. Natural valid model text passes unchanged. */
export function checkChatFacts(reply:ChatReply,npc:Npc,world:World,recall:PlayerRecall):ChatReply {
 if(reply.source!=="ai")return reply;
 const clauses=reply.reply.split(/[，,。；;！!？?\n]/).filter(Boolean);
 const current=clauses.filter(s=>!/昨天|前天|之前|上次|过去|曾经|假如|如果|之后|打算|希望/.test(s));
 const positive=current.filter(s=>!/(?:还没|没有|没做|未完成|不是|并非|不能说|不算)/.test(s));
 const workMention=/货架|理货|工作|整理|备餐|餐点/.test(reply.reply);
 const falseProgress=npc.workTask?.progress===0&&workMention&&!/昨天|前天|之前|上次|过去|曾经|[“”「」]/.test(reply.reply)&&positive.some(s=>/一半|半了|50[%％]|收尾|快(?:做完|完成)|已经(?:做完|完成|整理好)/.test(s));
 if(falseProgress){
  const moving=npc.ongoing?.decision.action.kind==="move";
  const destination=moving?world.locations.find(l=>l.id===(npc.ongoing!.decision.action as {to:string}).to)?.name:undefined;
  const text=destination?`这份工作还没完成第一步，我正去${destination}。`:"这份工作尚未完成第一步，还不能说做了一半。";
  return {...reply,reply:text,source:"fallback",reason:"fact_conflict",factCheck:{code:"unearned_work_progress",originalReply:reply.reply,sourceIds:[npc.workTask!.id]}};
 }
 const invitation=recall.events.find(e=>e.kind==="invited");
 if(invitation&&/只(?:是)?(?:简单)?(?:打过招呼|聊过天|闲聊)/.test(reply.reply)){
  const arrived=recall.events.some(e=>e.kind==="arrived"&&e.sourceId===invitation.sourceId);
  return {...reply,reply:arrived?"是你约我去咖啡馆的，我确实按约到过。":"你曾约我去咖啡馆，我记得这次邀请。",source:"fallback",reason:"fact_conflict",factCheck:{code:"denied_invitation_history",originalReply:reply.reply,sourceIds:[invitation.sourceId]}};
 }
 return reply;
}
