import type {Npc,World} from './world';
import {pathLength} from './action-time';
import {activeConversation} from './social';

/** Observations, not actions or shared NPC memories. Never read visitor/appointment text. */
export type LifeExpression={id:string;npcId:string;sceneId:Npc['sceneId'];minute:number;revision:number;kind:'speech'|'thought';text:string;topic:string;source:{actionId?:string;eventId?:number;action:string;energy:number;hunger:number;mood:number}};
export const LIFE_COOLDOWN=36;
const hash=(s:string)=>Array.from(s).reduce((n,c)=>(Math.imul(n,31)+c.codePointAt(0)!)>>>0,7);
type Candidate={topic:string;lines:[string,string];kind:'speech'|'thought'};
function candidate(before:Npc,n:Npc,w:World):Candidate|undefined{
  const current=n.ongoing,old=before.ongoing,kind=current?.decision.action.kind;
  if(old&&!current&&w.events.some(e=>e.npcId===n.id&&e.minute===w.minute)){
    if(old.decision.action.kind==='work'&&(n.workTask?.progress??0)>(before.workTask?.progress??0))return {topic:'work-step',kind:'speech',lines:['这一段忙完啦，慢慢来。','这一步做好了。']};
    if(old.decision.action.kind==='rest'&&n.energy>before.energy)return {topic:'rested',kind:'speech',lines:['休息一下，精神好多啦。','总算缓过来了。']};
    if(old.decision.action.kind==='eat'&&n.hunger<before.hunger)return {topic:'ate',kind:'speech',lines:['吃过东西，又有劲了！','这下不饿了。']};
    if(/条件已变化|中断/.test(n.action))return {topic:'interrupted',kind:'thought',lines:['得换个安排了。','先处理眼前的事吧。']};
  }
  if(current?.id!==old?.id&&current){
    if(kind==='work')return {topic:'working',kind:'speech',lines:[n.job==='cafe'?'开始备餐啦，慢慢做仔细。':'开始理货啦，一件件摆好。','先把手头这一步做好。']};
    if(kind==='rest')return {topic:'resting',kind:'thought',lines:['终于可以歇一歇啦。','安静休息一会儿。']};
    if(pathLength(current.path)>500)return {topic:'journey',kind:'speech',lines:['还有一段路，慢慢走吧。','路还长，不着急。']};
    if(n.energy<35)return {topic:'tired',kind:'thought',lines:['好想早点回去休息。','有些累了。']};
    if(n.hunger>=65)return {topic:'hungry',kind:'speech',lines:['肚子咕咕叫，得吃点东西了。','该找点吃的了。']};
    if(kind==='read')return {topic:'reading',kind:'thought',lines:['坐下来读几页，也不错。','这一会儿很安静。']};
    if(kind==='wait')return {topic:'waiting',kind:'thought',lines:['停下来歇歇脚吧。','等一会儿，看看周围。']};
  }
}
export function observeLife(before:World,w:World){
  const history=w.lifeExpressions??[];
  for(const n of w.npcs){
    if(activeConversation(w,n.id))continue;
    const old=before.npcs.find(p=>p.id===n.id);if(!old)continue;
    const c=candidate(old,n,w);if(!c)continue;
    const recent=history.filter(e=>e.npcId===n.id),last=recent.at(-1);
    if(last&&w.minute-last.minute<LIFE_COOLDOWN)continue;
    if(recent.some(e=>e.topic===c.topic&&w.minute-e.minute<180))continue;
    const id=`life:${w.revision}:${n.id}`;
    // Deterministic sampling: replay/transaction retries do not change the outcome.
    if(hash(id)%100>=65)continue;
    const event=w.events.find(e=>e.npcId===n.id&&e.minute===w.minute);
    history.push({id,npcId:n.id,sceneId:n.sceneId,minute:w.minute,revision:w.revision,kind:c.kind,text:c.lines[n.personality==='quiet'?1:0],topic:c.topic,source:{actionId:n.ongoing?.id??old.ongoing?.id,eventId:event?.id,action:n.action,energy:n.energy,hunger:n.hunger,mood:n.mood}});
  }
  if(history.length)w.lifeExpressions=history.slice(-120);
}
export function assertLife(w:World){
  if(!w.lifeExpressions)return;
  if(w.lifeExpressions.length>120||new Set(w.lifeExpressions.map(e=>e.id)).size!==w.lifeExpressions.length||w.lifeExpressions.some(e=>!w.npcs.some(n=>n.id===e.npcId)||!['speech','thought'].includes(e.kind)||Array.from(e.text).length>30||!e.text||e.minute>w.minute||!Number.isInteger(e.revision)))throw Error('生活观察记录无效');
}

/** One ambient bubble globally; higher priority interactions always win. */
export function lifeCandidates(w:World,sceneId:Npc['sceneId'],blocked:boolean){
  if(blocked)return [];
  return (w.lifeExpressions??[]).filter(e=>w.minute-e.minute<=12&&w.npcs.some(n=>n.id===e.npcId&&n.sceneId===sceneId&&e.sceneId===sceneId))
    .sort((a,b)=>(a.kind==='speech'?0:1)-(b.kind==='speech'?0:1)||b.revision-a.revision);
}
