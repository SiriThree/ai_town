import {STEP_MS,STEP_MINUTES,WALK_SPEED,pathLength,pathPoint,pathSection,actionDuration,type OngoingAction} from "./action-time";
import {prepareWork,settleWork,assertWork,workPoint,helperPoint,helpTarget,taskName,type WorkTask,type WorkResult} from "./work";
import {buildingAt,buildingIn,portalById,nearPortal,HOME_REST,homePath,validScenePath,npcCafeSpawn,canStand,portalSpawn,type SceneId} from "./scene-data";
import {TOWN_BUILDINGS} from "./town-map";
import {assertSocial,beginSocial,advanceConversations,type PublicConversation} from "./social";
import {observeEncounters,assertExperiences,type Experiences} from "./experiences";
import {RESIDENTS} from "./residents";
import {findScenePath} from "./navigation";
export type LocationId = typeof TOWN_BUILDINGS[number]["id"] | "square";
export type Point = { x: number; y: number };
export type Action = {kind:"work"}|{kind:"help"|"approach-work";target:string}|{ kind:"walk-inside"; to:"activity"|"exit" } | { kind: "move"; to: LocationId } | { kind: "eat" | "rest" | "socialize" | "read" | "wait" | "enter" | "exit" };
export type Decision = { action: Action; reason: string };
export type Npc = {
  id: string; ongoing?:OngoingAction; workTask?:WorkTask; lastHelpTaskId?:string; lastHelpMinute?:number; homeId?:LocationId; job?:"cafe"|"store"; preference?:"service"|"home"|"social"|"study"; bio?:string; appearance?:string; name: string; personality: "outgoing" | "quiet";
  hunger: number; energy: number; mood: number; location: LocationId;
  sceneId: SceneId; facing?: "north"|"south"|"east"|"west"; position: Point; action: string; reason: string; lastPath: Point[];
};
export type TownEvent = { id: number; minute: number; npcId: Npc["id"]; text: string; reason: string };
export type World = {
  schemaVersion: 2; workOutputs?:{cafe:number;store:number}; workHistory?:WorkResult[]; rosterVersion?:1; experiences?:Experiences; conversations?:PublicConversation[]; socialBudget?:{day:number;used:number}; revision: number; name: string; minute: number;
  run?: { running: boolean; nextTickAt: number | null };
  locations: { id: LocationId; name: string; use: string }[];
  npcs: Npc[]; events: TownEvent[];
};
export const MAP = { width: 960, height: 600, roadY: 358 };
export const AUTO_INTERVAL_MS = STEP_MS;
export const FOOD_AMOUNT = 35;
// Older persisted worlds have no run field and stay paused until explicitly started.
export const runState = (world: World) => world.run ?? { running: false, nextTickAt: null };
export const LOCATIONS: World["locations"] = [
  { id: "home", name: "暖灯小屋", use: "住宅 · 休息" },
  { id: "cafe", name: "麦香咖啡馆", use: "咖啡馆 · 进食" },
  { id: "square", name: "树荫广场", use: "广场 · 社交 / 阅读" },
];
export const ACTION_LABELS = { eat: "享用餐点", rest: "在床边休息", socialize: "与邻居闲聊", read: "安静阅读", wait: "稍作停留" };
const clamp = (n: number) => Math.max(0, Math.min(100, n));
export function positionAt(location: LocationId, id: Npc["id"]): Point {
  const second = id === "aning";
  const building=buildingAt(location);
  if(building)return portalSpawn(building.exit,id);
  return id==="aqing"||id==="aning"?{ x: second ? 524 : 442, y: second ? 392 : 368 }:{x:420+Math.max(0,RESIDENTS.findIndex(n=>n.id===id))*34,y:340};
}
export function createWorld(): World {
  return {
    schemaVersion: 2, revision: 0, name: "晨露村", minute: 8 * 60,
    locations: structuredClone(LOCATIONS), events: [],
    npcs: [
      { id: "aqing", name: "阿晴", personality: "outgoing", hunger: 59, energy: 78, mood: 62 },
      { id: "aning", name: "阿宁", personality: "quiet", hunger: 20, energy: 84, mood: 58 },
    ].map(n => ({ ...n, sceneId:"town", location: "square", position: positionAt("square", n.id as Npc["id"]), action: "刚到广场", reason: "新的一天，从广场开始。", lastPath: [] })) as Npc[],
  };
}
export function populateResidents(world:World):World {
  const next=structuredClone(world);let changed=!next.rosterVersion;
  for(const d of RESIDENTS)if(!next.npcs.some(n=>n.id===d.id)){
    next.npcs.push({...d,hunger:18,energy:86,mood:68,location:"square",sceneId:"town",position:positionAt("square",d.id),action:"来到小镇",reason:"保留原居民，新增居民从合法广场位置开始。",lastPath:[]});changed=true;
  }
  if(!changed)return world;
  for(const b of TOWN_BUILDINGS)if(!next.locations.some(l=>l.id===b.id))next.locations.push({id:b.id,name:b.name,use:"小镇生活场所"});
  next.rosterVersion=1;next.revision++;assertWorld(next);return next;
}
export const homeOf=(n:Npc):LocationId=>n.homeId??"home";
export const restPoint=(n:Npc):Point=>!n.homeId?HOME_REST[n.id].position:n.homeId==="stone"?{x:588,y:300}:{x:370,y:300};
export function indoorPath(n:Npc,to:"activity"|"exit"):Point[]{
  if(!n.homeId&&n.sceneId==="home_interior")return homePath(n.id,to);
  const b=buildingIn(n.sceneId);if(!b)return [];
  return findScenePath(n.sceneId,n.position,to==="exit"?portalSpawn(b.door,n.id):n.job===n.location?workPoint(n):restPoint(n));
}
export function canExecute(npc: Npc, action: Action, world: World): boolean {
  switch (action.kind) {
    case "move": {
      const building=buildingAt(action.to);
      return npc.sceneId==="town" && world.locations.some(l=>l.id===action.to) && (npc.location!==action.to || !!building&&!nearPortal(portalById(building.door),npc.position));
    }
    case "enter": {
      const b=buildingAt(npc.location);if(!b||npc.sceneId!=="town")return false;
      const p=portalById(b.door);return nearPortal(p,npc.position)&&canStand(p.target,portalSpawn(p.id,npc.id));
    }
    case "exit": {
      const b=buildingIn(npc.sceneId);if(!b||npc.location!==b.location)return false;
      const p=portalById(b.exit);return nearPortal(p,npc.position)&&canStand(p.target,portalSpawn(p.id,npc.id));
    }
    case "walk-inside": {
      if(!buildingIn(npc.sceneId)|| (action.to==="activity"&&npc.location!==homeOf(npc)&&npc.location!==npc.job))return false;
      const path=indoorPath(npc,action.to);
      return samePoint(npc.position,path[0])&&validScenePath(npc.sceneId,path);
    }
    case "work": return !!npc.job&&npc.sceneId===`${npc.job}_interior`&&samePoint(npc.position,workPoint(npc))&&npc.workTask?.phase==="active"&&npc.energy>=35&&npc.hunger<65;
    case "help": case "approach-work": {
      const target=helpTarget(npc,world);if(!target||target.id!==action.target)return false;
      return action.kind==="help"?Math.hypot(npc.position.x-target.position.x,npc.position.y-target.position.y)<=100:validScenePath(npc.sceneId,findScenePath(npc.sceneId,npc.position,helperPoint(target)));
    }
    case "eat": return npc.sceneId==="cafe_interior" && npc.location === "cafe";
    case "rest": return npc.sceneId!=="town" && npc.location===homeOf(npc) && samePoint(npc.position,restPoint(npc));
    case "read": return (npc.sceneId==="town" && npc.location === "square") || (!!npc.homeId&&npc.sceneId!=="town");
    case "socialize": return npc.sceneId==="town" && npc.location === "square" && world.npcs.some(n => n.id !== npc.id && n.sceneId==="town" && n.location === "square");
    case "wait": return true;
    default: return false;
  }
}
export function decide(npc: Npc, world: World): Decision {
  let target: LocationId = "square";
  let activity: Action = { kind: "read" };
  let reason: string;
  if (npc.sceneId!=="town" && npc.location===homeOf(npc) && samePoint(npc.position,restPoint(npc)) && npc.energy<65 && npc.hunger<85) {
    target=homeOf(npc);activity={kind:"rest"};reason=`正在床边恢复，精力 ${npc.energy} 尚未恢复到 65，饥饿 ${npc.hunger} 未到紧急程度。`;
  } else if (npc.energy <= (npc.preference==="home"?45:npc.job?35:25) && (npc.hunger < 65 || 100 - npc.energy >= npc.hunger)) {
    target = homeOf(npc); activity = { kind: "rest" }; reason = `精力只有 ${npc.energy}，先休息恢复体力。`;
  } else if (npc.hunger >= 65) {
    target = "cafe"; activity = { kind: "eat" }; reason = `饥饿达到 ${npc.hunger}，先去填饱肚子。`;
  } else if(helpTarget(npc,world)){
    const worker=helpTarget(npc,world)!;
    const action:Action={kind:Math.hypot(npc.position.x-worker.position.x,npc.position.y-worker.position.y)<=100?"help":"approach-work",target:worker.id};
    if(canExecute(npc,action,world))return {action,reason:`需求满足，协助在场的${worker.name}核对当前真实任务。`};
    return {action:{kind:"wait"},reason:"协助位置暂不可达。"};
  } else if(npc.preference==="service"&&npc.job){
    target=npc.job;activity={kind:npc.workTask?.phase==="active"?"work":"read"};reason=npc.workTask?.phase==="active"?`继续${taskName(npc.job)}，已保存进度 ${npc.workTask.progress}/2。`:"任务完成后短暂阅读休息，等待下一份工作。";
  } else if(npc.preference==="home"){
    target=homeOf(npc);activity={kind:"read"};reason="偏好居家与安静，在自己的房间读书。";
  } else if(npc.preference==="study"){
    target="library";activity={kind:"read"};reason="偏好公共书屋的阅读环境。";
  } else if (npc.personality === "outgoing" && world.npcs.some(n => n.id !== npc.id && n.sceneId==="town" && n.location === "square")) {
    activity = { kind: "socialize" }; reason = `基本需求满足，心情 ${npc.mood}；喜欢热闹，想与广场上的邻居交流。`;
  } else {
    reason = npc.personality === "quiet" ? `基本需求满足，心情 ${npc.mood}；喜欢安静，读一会儿书。` : "广场暂时没有伙伴，先读书等邻居。";
  }
  const currentBuilding=buildingIn(npc.sceneId),targetBuilding=buildingAt(target);
  let action:Action;
  if(currentBuilding){
    if(currentBuilding.location===target){
      action=((target===homeOf(npc)&&!samePoint(npc.position,restPoint(npc)))||(activity.kind==="work"&&!samePoint(npc.position,workPoint(npc))))?{kind:"walk-inside",to:"activity"}:activity;
    }else action=nearPortal(portalById(currentBuilding.exit),npc.position)?{kind:"exit"}:{kind:"walk-inside",to:"exit"};
  }else if(targetBuilding){
    action=npc.location===target&&nearPortal(portalById(targetBuilding.door),npc.position)?{kind:"enter"}:{kind:"move",to:target};
  }else action=npc.location===target?activity:{kind:"move",to:target};
  if (!canExecute(npc, action, world)) return { action: { kind: "wait" }, reason: "当前条件不满足，稍作停留。" };
  return { action, reason };
}
// Each route belongs to one scene. Portal transitions have an empty lastPath.
export function roadPath(npc: Npc, to: LocationId): Point[] {
  if(npc.sceneId!=="town")throw new Error("室内坐标不能生成室外路径");
  const end = positionAt(to, npc.id);
  if(npc.homeId)return findScenePath("town",npc.position,end);
  return [npc.position, { x: npc.position.x, y: MAP.roadY }, { x: end.x, y: MAP.roadY }, end];
}
export function execute(npc: Npc, decision: Decision, world: World): Npc {
  const { action, reason } = decision;
  if (!canExecute(npc, action, world)) throw new Error("非法动作：地点或参与条件不满足");
  const next = structuredClone(npc);
  delete next.ongoing;
  next.reason = reason;
  next.lastPath = [];
  delete next.facing;
  switch (action.kind) {
    case "move":
      next.lastPath = roadPath(npc, action.to); next.location = action.to;
      next.position = positionAt(action.to, npc.id); next.energy -= 3;
      next.action = `来到${world.locations.find(l => l.id === action.to)!.name}${buildingAt(action.to)?"室外门口":""}`; break;
    case "enter":
    case "exit": {
      const b=action.kind==="enter"?buildingAt(npc.location)!:buildingIn(npc.sceneId)!;
      const portal=portalById(action.kind==="enter"?b.door:b.exit);
      next.sceneId=portal.target;next.position=portalSpawn(portal.id,npc.id);next.facing=portal.facing;
      next.action=action.kind==="enter"?`进入${b.name}`:`离开${b.name}，回到门前`;break;
    }
    case "walk-inside":
      next.lastPath=indoorPath(npc,action.to);next.position={...next.lastPath.at(-1)!};
      next.action=action.to==="activity"?`走到${buildingIn(npc.sceneId)!.name}${npc.job===npc.location?"工作台旁":"床边"}`:`走到${buildingIn(npc.sceneId)!.name}出口`;break;
    case "work":
      next.workTask!.progress++; next.energy-=8; next.facing="north";
      next.action=`${taskName(npc.job!)} · ${next.workTask!.progress}/2`;
      if(next.workTask!.progress===2){next.workTask!.phase="completed";next.workTask!.completedMinute=world.minute;}
      break;
    case "approach-work": {
      const worker=world.npcs.find(n=>n.id===action.target)!;
      next.lastPath=findScenePath(npc.sceneId,npc.position,helperPoint(worker));next.position={...next.lastPath.at(-1)!};next.action=`走向${worker.name}的工作台旁`;break;
    }
    case "help": {
      const worker=world.npcs.find(n=>n.id===action.target)!;
      next.lastHelpTaskId=worker.workTask!.id;next.lastHelpMinute=world.minute;next.energy-=4;next.action=`协助${worker.name}核对工作`;break;
    }
    case "eat": next.hunger -= 50; next.energy += 6; break;
    case "rest": next.facing=npc.homeId?(npc.homeId==="stone"?"east":"west"):HOME_REST[npc.id].facing;next.energy += 40; next.mood += 4; break;
    case "socialize": next.mood += 14; next.energy -= 6; break;
    case "read": next.mood += 9; next.energy -= 2; break;
    case "wait": next.energy += 3; break;
  }
  if (action.kind in ACTION_LABELS) next.action = ACTION_LABELS[action.kind as keyof typeof ACTION_LABELS];
  next.hunger = clamp(next.hunger); next.energy = clamp(next.energy); next.mood = clamp(next.mood);
  return next;
}
// Start does not apply the preview's effects. Only settlement may change needs/location.
function beginAction(n:Npc,w:World):Npc {
  const decision=decide(n,w),preview=execute(n,decision,w),path=preview.lastPath;
  const ongoing:OngoingAction={id:`action:${w.revision}:${n.id}`,decision,sceneId:n.sceneId,startedMinute:w.minute,
    elapsedMs:0,durationMs:actionDuration(decision.action.kind,path),path:structuredClone(path)};
  const label=path.length>1?`正在行走 · ${preview.action.replace(/^来到|^走到|^走向/,"")}`:
    decision.action.kind==="work"?`正在${taskName(n.job!)}（尚未完成）`:
    decision.action.kind==="help"?"正在协助核对":`${preview.action} · 进行中`;
  return {...n,ongoing,lastPath:[],action:label,reason:decision.reason};
}
function progressAction(n:Npc,w:World):{npc:Npc;completed:boolean} {
  const pending=n.ongoing!;
  // Committed routes finish at a safe point. Urgent needs interrupt stationary work,
  // retaining WorkTask progress; ordinary checks cannot replace an ongoing action.
  if(!pending.path.length && ["work","help","read","socialize","wait"].includes(pending.decision.action.kind) && (n.hunger>=90||n.energy<=10)){
    const next={...n,action:"中断活动，先处理紧急需求",lastPath:[]};delete next.ongoing;return {npc:next,completed:true};
  }
  const elapsed=Math.min(pending.durationMs,pending.elapsedMs+STEP_MS);
  const next={...n,ongoing:{...pending,elapsedMs:elapsed},lastPath:[] as Point[]};
  if(pending.path.length>1){
    next.lastPath=pathSection(pending.path,pending.elapsedMs*WALK_SPEED/1000,elapsed*WALK_SPEED/1000);
    next.position=pathPoint(pending.path,elapsed*WALK_SPEED/1000);
  }
  if(elapsed<pending.durationMs)return {npc:next,completed:false};
  const input={...next,position:pending.path[0]??next.position};delete (input as Npc).ongoing;
  if(!canExecute(input,pending.decision.action,w)){
    const stopped:Npc={...next,action:"条件已变化，保留当前位置重新考虑",lastPath:[]};delete stopped.ongoing;return {npc:stopped,completed:true};
  }
  const settled=execute(input,pending.decision,w);
  settled.lastPath=next.lastPath;
  return {npc:settled,completed:true};
}
export function advanceWorld(world: World): World {
  const next = structuredClone(world);
  next.minute += STEP_MINUTES; next.revision += 1;
  // Slower metabolism allows actual cross-town travel. No needs change per render frame.
  if(Math.floor(next.minute/30)!==Math.floor(world.minute/30))
    next.npcs=next.npcs.map(n=>({...n,hunger:clamp(n.hunger+2),energy:clamp(n.energy-1),mood:clamp(n.mood-1)}));
  prepareWork(next);
  const talking=advanceConversations(next);
  for (let i=0;i<next.npcs.length;i++) {
    let n=next.npcs[i];
    if(talking.has(n.id))continue;
    if(!n.ongoing)n=beginAction(n,next);
    const result=progressAction(n,next);next.npcs[i]=result.npc;
    if(result.completed)next.events.push({id:next.revision*1000+i,minute:next.minute,npcId:n.id,text:`${n.name} · ${result.npc.action}`,reason:n.reason});
  }
  settleWork(next);beginSocial(next);observeEncounters(next);
  next.events=next.events.slice(-100);return next;
}
export function giveFood(world: World, npcId: string): World {
  const npc = world.npcs.find(n => n.id === npcId);
  if (!npc) throw new Error("居民不存在");
  if (npc.hunger <= 0) throw new Error("居民已经吃饱了，暂不需要食物。");
  const next = structuredClone(world);
  const target = next.npcs.find(n => n.id === npcId)!;
  target.hunger = clamp(target.hunger - FOOD_AMOUNT);
  next.revision += 1;
  next.events.push({ id: next.revision * 1000, minute: next.minute, npcId: target.id,
    text: `你给${target.name}送了食物 · 饥饿 ${npc.hunger} → ${target.hunger}`,
    reason: "玩家提供食物；只降低饥饿，下一步仍由居民根据真实需求选择。" });
  next.events = next.events.slice(-100);
  return next;
}
export function advanceOnClock(world: World, now: number, automatic: boolean): World {
  const run = runState(world);
  if (automatic && (!run.running || run.nextTickAt === null || now < run.nextTickAt)) return world;
  const next = advanceWorld(world);
  if (run.running) next.run = { running: true, nextTickAt: now + AUTO_INTERVAL_MS };
  return next;
}
const samePoint=(a:Point|undefined,b:Point)=>a?.x===b.x&&a?.y===b.y;
function validNpcPosition(n:Npc):boolean {
  if(n.ongoing?.path.length)return canStand(n.sceneId,n.position)&&n.sceneId===n.ongoing.sceneId&&(n.sceneId==="town"||buildingIn(n.sceneId)?.location===n.location);
  if(n.homeId)return !!buildingAt(n.homeId)&&canStand(n.sceneId,n.position)&&(n.sceneId==="town"||buildingIn(n.sceneId)?.location===n.location);
  if(n.sceneId==="cafe_interior")return n.location==="cafe"&&samePoint(n.position,npcCafeSpawn(n.id));
  if(n.sceneId==="home_interior")return n.location==="home"&&(samePoint(n.position,portalById("home-door").npcSpawns[n.id])||samePoint(n.position,HOME_REST[n.id].position));
  if(n.sceneId!=="town")return false;
  return samePoint(n.position,positionAt(n.location,n.id)) || (n.location==="cafe"&&samePoint(n.position,{x:n.id==="aning"?778:746,y:306})) || (n.location==="home"&&samePoint(n.position,{x:n.id==="aning"?242:210,y:306}));
}
// Read compatibility is non-destructive. The next normal locked world write persists v2.
export function restoreWorld(value:unknown):World {
  const raw=value as World;
  if((raw?.schemaVersion as number)===1){
    const next=structuredClone(raw);
    if(!Array.isArray(next.npcs)||next.npcs.some(n=>n.sceneId!==undefined))throw new Error("旧存档场景字段不兼容");
    next.schemaVersion=2;next.npcs.forEach(n=>{n.sceneId="town";});
    assertWorld(next);return next;
  }
  assertWorld(raw);return raw;
}
export function npcPlace(npc:Npc,world:World):string {
  const name=world.locations.find(l=>l.id===npc.location)!.name;
  if(npc.ongoing?.path.length)return `${npc.sceneId==="town"?"室外道路":buildingIn(npc.sceneId)?.name+"室内"} · 途中（尚未到达）`;
  return buildingAt(npc.location)?`${name} · ${npc.sceneId!=="town"?"室内":"室外门口"}`:name;
}
export function assertWorld(value: unknown): asserts value is World {
  const w = value as World;
  if (!w || w.schemaVersion !== 2 || !Number.isSafeInteger(w.revision) || w.revision < 0 || !Number.isSafeInteger(w.minute) || w.minute < 480 || (!Array.isArray(w.npcs)||w.npcs.length<2||w.npcs.length>30) || !Array.isArray(w.events) || (!Array.isArray(w.locations)||w.locations.length<3) || !LOCATIONS.every((l, i) => w.locations[i].id === l.id && w.locations[i].name === l.name && w.locations[i].use === l.use)) throw new Error("不兼容的世界存档");
  if (new Set(w.npcs.map(n => n.id)).size !== w.npcs.length) throw new Error("重复的居民存档");
  if (w.run !== undefined && (!w.run || typeof w.run.running !== "boolean" || (w.run.running ? !Number.isSafeInteger(w.run.nextTickAt) || w.run.nextTickAt! < 0 : w.run.nextTickAt !== null))) throw new Error("运行状态存档无效");
  assertExperiences(w);assertSocial(w);assertWork(w);
  for (const n of w.npcs) {
    if(n.ongoing){
      const a=n.ongoing;
      if(typeof a.id!=="string"||a.sceneId!==n.sceneId||!Number.isFinite(a.durationMs)||a.durationMs<=0||!Number.isFinite(a.elapsedMs)||a.elapsedMs<0||a.elapsedMs>=a.durationMs||!Number.isSafeInteger(a.startedMinute)||a.startedMinute>w.minute||!Array.isArray(a.path)||
        (a.path.length>0&&(!validScenePath(n.sceneId,a.path)||Math.hypot(n.position.x-pathPoint(a.path,a.elapsedMs*WALK_SPEED/1000).x,n.position.y-pathPoint(a.path,a.elapsedMs*WALK_SPEED/1000).y)>.01||Math.abs(a.durationMs-Math.max(STEP_MS,pathLength(a.path)/WALK_SPEED*1000))>.01)))throw new Error("持续行动存档无效");
    }
    if ((!/^[a-z][a-z0-9_-]{0,39}$/.test(n.id)||(!n.homeId&&!["aqing","aning"].includes(n.id))) || !["quiet", "outgoing"].includes(n.personality) || !w.locations.some(l => l.id === n.location) || [n.hunger, n.energy, n.mood].some(v => !Number.isFinite(v) || v < 0 || v > 100) || !validNpcPosition(n) || !Array.isArray(n.lastPath) || (!n.ongoing&&!n.homeId&&n.sceneId==="cafe_interior"&&n.lastPath.length!==0) || (n.facing!==undefined&&!["north","south","east","west"].includes(n.facing)) || (n.sceneId==="home_interior"&&n.lastPath.length!==0&&(!validScenePath(n.sceneId,n.lastPath)||!samePoint(n.lastPath.at(-1),n.position))) || (n.homeId&&n.lastPath.length>0&&(!validScenePath(n.sceneId,n.lastPath)||!samePoint(n.lastPath.at(-1),n.position))) || n.lastPath.some(p=>!Number.isFinite(p.x)||!Number.isFinite(p.y))) throw new Error("居民存档无效");
  }
}
export function worldTime(minute: number): string {
  return `第 ${Math.floor(minute / 1440) + 1} 天 · ${String(Math.floor(minute / 60) % 24).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
}

