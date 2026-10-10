import {canExecute,type Action,type Decision,type LocationId,type Npc,type World} from './world';
import {helpTarget} from './work';
import {meetingPlace,MEETING_PLACES} from './meeting-places';

export type GoalKind='meet'|'social'|'assist';
export type PlanStep='travel'|'wait_for_player'|'socialize'|'approach-work'|'help'|'read';
export type GoalPlan={steps:PlanStep[];cursor:number;workerId?:string;workTaskId?:string;evidence:{actionId:string;kind:string;minute:number}[]};
export const GOAL_RECIPES:Record<GoalKind,{label:string;capability:string;steps:PlanStep[]}>= {
 meet:{label:'会面',capability:'meet',steps:['travel','wait_for_player']},
 social:{label:'在当地交流',capability:'socialize',steps:['travel','socialize']},
 assist:{label:'协助核对工作',capability:'help',steps:['travel','approach-work','help']},
};
export const isGoalKind=(v:unknown):v is GoalKind=>typeof v==='string'&&Object.hasOwn(GOAL_RECIPES,v);
export const waitsForPlayer=(plan:GoalPlan|undefined)=>!plan||plan.steps.includes('wait_for_player');
/** A small recipe compiler. It contains primitive permissions, not handlers per activity/place. */
export function compileGoalPlan(recipe:{capability:string;steps:PlanStep[]},target:LocationId,n:Npc,w:World):{plan?:GoalPlan;error?:string}{
 const place=MEETING_PLACES.find(p=>p.id===target),spot=meetingPlace(target,n.id);
 if(!place||!spot||!place.capabilities.includes(recipe.capability))return {error:'该地点没有完成这个目标所需的世界能力。'};
 const projected={...n,location:target,sceneId:spot.sceneId,position:spot.position};
 const plan:GoalPlan={steps:[...recipe.steps],cursor:0,evidence:[]};
 for(const step of recipe.steps){
  if(step==='travel'||step==='wait_for_player')continue;
  if(step==='approach-work'||step==='help'){
   const worker=helpTarget(projected,w);
   if(!worker)return {error:'现在没有我有权限协助的在场工作，不能假装整理货架。'};
   plan.workerId=worker.id;plan.workTaskId=worker.workTask!.id;
  }else if(!canExecute(projected,{kind:step},w))return {error:'当前条件不支持这项行动，需要合适的状态和在场居民。'};
 }
 return {plan};
}
export function nextPlanAction(n:Npc,w:World):Decision|null{
 const a=n.appointment,plan=a?.plan;if(!a||!plan||a.status!=='executing')return null;
 const step=plan.steps[plan.cursor];if(!step||step==='travel'||step==='wait_for_player')return null;
 let action:Action;
 if(step==='approach-work'||step==='help'){
  const worker=helpTarget(n,w);
  if(!worker||worker.id!==plan.workerId||worker.workTask?.id!==plan.workTaskId)return null;
  action={kind:step,target:worker.id};
 }else action={kind:step};
 if(!canExecute(n,action,w))return null;
 return {action,reason:'履行已确认目标，执行世界已有基础行动。',goalStep:{id:a.id,cursor:plan.cursor}};
}
export function settleGoalStep(n:Npc,w:World,decision:Decision,actionId:string,succeeded:boolean){
 const a=n.appointment,plan=a?.plan,step=decision.goalStep;
 if(!a||!plan||!step||step.id!==a.id||step.cursor!==plan.cursor||a.status!=='executing')return;
 if(!succeeded){a.status='failed';a.reason='执行时前置条件变化，这一步没有完成。';}
 else{
  plan.evidence.push({actionId,kind:decision.action.kind,minute:w.minute});plan.cursor++;
  if(plan.cursor===plan.steps.length){a.status='completed';a.reason='计划中的基础行动均已由世界实际执行。';}
 }
 a.updatedMinute=w.minute;
 if(['failed','completed'].includes(a.status))w.events.push({id:w.revision*1000+730+w.npcs.findIndex(p=>p.id===n.id),minute:w.minute,npcId:n.id,text:`${n.name}${a.status==='completed'?'完成':'未能完成'}${GOAL_RECIPES[a.goal??'meet'].label}`,reason:a.reason});
}
