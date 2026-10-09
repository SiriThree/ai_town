import type {World,Npc,Point} from "./world";
import {recordExperience} from "./experiences";
import {canStand} from "./scene-data";

export type WorkTask={id:string;kind:"cafe"|"store";progress:number;phase:"active"|"paused"|"completed";createdMinute:number;completedMinute?:number};
export type WorkResult={taskId:string;workerId:string;kind:"cafe"|"store";eventId:number;minute:number};
export const workPoint=(n:Npc):Point=>n.job==="store"?{x:600,y:300}:{x:480,y:280};
export const helperPoint=(n:Npc):Point=>({x:workPoint(n).x+40,y:workPoint(n).y+40});
export const taskName=(kind:"cafe"|"store")=>kind==="cafe"?"制作一份餐点":"整理一组货架";
export function prepareWork(w:World){
  for(const n of w.npcs){
    if(!n.job)continue;
    if(!n.workTask||(n.workTask.phase==="completed"&&w.minute-n.workTask.completedMinute!>=180))
      n.workTask={id:`work:${n.id}:${w.revision}`,kind:n.job,progress:0,phase:"active",createdMinute:w.minute};
    if(n.workTask.phase!=="completed")n.workTask.phase=n.energy<35||n.hunger>=65?"paused":"active";
  }
}
export function helpTarget(n:Npc,w:World):Npc|undefined {
  if(!n.homeId||n.job||n.personality!=="outgoing"||n.energy<40||n.hunger>=65)return;
  return w.npcs.find(worker=>worker.job&&worker.sceneId===n.sceneId&&worker.sceneId===`${worker.job}_interior`&&worker.workTask&&
    (worker.workTask.phase==="active"||worker.workTask.completedMinute===w.minute)&&worker.workTask.id!==n.lastHelpTaskId&&
    worker.position.x===workPoint(worker).x&&worker.position.y===workPoint(worker).y);
}
export function settleWork(w:World){
  for(const n of w.npcs){
    const task=n.workTask;if(!task||task.phase!=="completed"||task.completedMinute!==w.minute||w.workHistory?.some(r=>r.taskId===task.id))continue;
    const helpers=w.npcs.filter(h=>h.lastHelpTaskId===task.id&&h.lastHelpMinute===w.minute&&h.sceneId===n.sceneId&&Math.hypot(h.position.x-n.position.x,h.position.y-n.position.y)<=100);
    const result=`${n.name}完成${taskName(task.kind)}${helpers.length?`，${helpers.map(h=>h.name).join("、")}协助核对`:""}；${task.kind==="cafe"?"餐点":"货架"}产出 +1。`;
    const fact=recordExperience(w,[n.id,...helpers.map(h=>h.id)],"work",task.id,result);if(!fact)throw new Error("工作缺少合法在场事实");
    w.workOutputs??={cafe:0,store:0};w.workOutputs[task.kind]++;
    w.workHistory=[...(w.workHistory??[]),{taskId:task.id,workerId:n.id,kind:task.kind,eventId:fact.id,minute:w.minute}].slice(-100);
  }
  // Help before completion is a real preparation action, with its own sourced result.
  for(const h of w.npcs){
    if(h.lastHelpMinute!==w.minute)continue;
    const worker=w.npcs.find(n=>n.workTask?.id===h.lastHelpTaskId);if(!worker||worker.workTask!.phase==="completed")continue;
    recordExperience(w,[worker.id,h.id],"work",`help:${h.lastHelpTaskId}:${h.id}`,`${h.name}协助${worker.name}核对${taskName(worker.job!)}的准备；任务尚未完成，不发放产出。`);
  }
}
export function assertWork(w:World){
  if(w.workOutputs&&Object.values(w.workOutputs).some(v=>!Number.isSafeInteger(v)||v<0))throw new Error("工作产出无效");
  if(w.workHistory&&(w.workHistory.length>100||new Set(w.workHistory.map(r=>r.taskId)).size!==w.workHistory.length||w.workHistory.some(r=>!w.experiences?.facts.some(f=>f.id===r.eventId&&f.kind==="work"&&f.participants.includes(r.workerId)))))throw new Error("工作产出缺少来源");
  for(const n of w.npcs){const t=n.workTask;if(!t)continue;
    if(t.kind!==n.job||!canStand(`${t.kind}_interior`,workPoint(n))||!Number.isInteger(t.progress)||t.progress<0||t.progress>2||!["active","paused","completed"].includes(t.phase)||(t.phase==="completed")!==(t.progress===2)||(t.phase==="completed"&&!Number.isSafeInteger(t.completedMinute)))throw new Error("工作任务存档无效");
  }
}
