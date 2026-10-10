import {it,expect} from 'vitest';
import {parseUnderstanding,absoluteMeetingTime} from '../src/lib/meeting-language';
import {compileGoalPlan,GOAL_RECIPES,nextPlanAction,settleGoalStep} from '../src/lib/goal-plan';
import {createWorld,populateResidents,positionAt,execute,type Npc} from '../src/lib/world';
import {meetingPlace,meetingAccess} from '../src/lib/meeting-places';
import {workPoint} from '../src/lib/work';
import {checkMeetingSpeech} from '../src/lib/natural-chat';
const intent={goal:'meet',operation:'propose',destination:'cafe',time:null,timing:'now',confidence:.95,referenceId:null};
it('模型协议严格校验地点、动作、字段和时间，无法发明能力',()=>{
 expect(parseUnderstanding(JSON.stringify({kind:'goal',intent}))).not.toBeNull();
 for(const patch of [{goal:'give_money'},{destination:'moon'},{confidence:1.2},{operation:'sql'},{time:{day:1,hour:25,minute:0},timing:'scheduled'},{execute:true}])expect(parseUnderstanding(JSON.stringify({kind:'goal',intent:{...intent,...patch}}))).toBeNull();
 expect(absoluteMeetingTime({day:6,hour:13,minute:0})).toBe(7980);
 expect(absoluteMeetingTime({day:6,hour:null,minute:0})).toBeUndefined();
});
it('地点配置复用门户坐标与权限，不按地点创建Handler',()=>{
 const w=populateResidents(createWorld()),n=w.npcs[0];
 for(const target of ['cafe','square','library'] as const){expect(meetingPlace(target,n.id)).not.toBeNull();expect(meetingAccess(target,n,w)).toBeNull();expect(compileGoalPlan(GOAL_RECIPES.meet,target,n,w).plan?.steps).toEqual(['travel','wait_for_player']);}
 expect(meetingAccess('stone',n,w)).toMatch(/私人/);
});
it('增加现有动作组合只需配方；实际结算而非预览才推进计划游标',()=>{
 const w=populateResidents(createWorld()),n=w.npcs[0];Object.assign(n,{location:'square',sceneId:'town',position:positionAt('square',n.id),energy:85,hunger:10});
 const plan=compileGoalPlan({capability:'read',steps:['travel','read']},'square',n,w).plan!;
 n.appointment={id:'00000000-0000-4000-8000-000000000001',target:'square',goal:'social',plan,status:'executing',reason:'test',createdMinute:w.minute,updatedMinute:w.minute,deadlineMinute:w.minute+60};plan.cursor=1;
 const decision=nextPlanAction(n,w)!;expect(decision.action.kind).toBe('read');const preview=execute(n,decision,w);expect(n.appointment.plan!.cursor).toBe(1);
 settleGoalStep(preview,w,decision,'real-action',true);expect(preview.appointment?.status).toBe('completed');expect(preview.appointment?.plan?.evidence).toEqual([{actionId:'real-action',kind:'read',minute:w.minute}]);
 settleGoalStep(preview,w,decision,'real-action',true);expect(preview.appointment?.plan?.evidence).toHaveLength(1);
});
it('协助须有合法职业对象和真实任务；不冒充整个工作已完成',()=>{
 const w=populateResidents(createWorld()),n=w.npcs.find(n=>n.id==='xiaoman')!,worker=w.npcs.find(n=>n.id==='laolin')!;
 expect(compileGoalPlan(GOAL_RECIPES.assist,'store',n,w).error).toBeTruthy();
 Object.assign(worker,{sceneId:'store_interior',location:'store',position:workPoint(worker),workTask:{id:'task',kind:'store',phase:'active',progress:0,createdMinute:w.minute}});
 Object.assign(n,{energy:90,hunger:10});expect(compileGoalPlan(GOAL_RECIPES.assist,'store',n,w).plan?.workTaskId).toBe('task');
 const quiet={...n,personality:'quiet'} as Npc;expect(compileGoalPlan(GOAL_RECIPES.assist,'store',quiet,w).error).toBeTruthy();
 expect(compileGoalPlan(GOAL_RECIPES.assist,'square',n,w).error).toBeTruthy();expect(worker.workTask?.progress).toBe(0);
});
it('后台确认结果约束地点、到达与完成事实，不替换正常表达',()=>{
 const outcome={code:'saved' as const,running:true,explanation:'尚在协商咖啡馆时间。',appointment:{id:'goal',target:'cafe' as const,status:'proposed' as const,reason:'test',createdMinute:720,updatedMinute:720,deadlineMinute:900}};
 for(const reply of ['好呀，广场见！','说好啦，一点见！','我到咖啡馆了'])expect(checkMeetingSpeech({source:'ai',reply},outcome).source).toBe('fallback');
 const reply='咖啡馆可以呀，几点合适呢？';expect(checkMeetingSpeech({source:'ai',reply},outcome).reply).toBe(reply);
 expect(checkMeetingSpeech({source:'ai',reply:'树荫广场见！'},{...outcome,appointment:{...outcome.appointment,target:'square',status:'accepted'}}).source).toBe('ai');
});
