import {buildingAt,buildingIn,portalById,nearPortal,HOME_REST,homePath,validScenePath,npcCafeSpawn,canStand,type SceneId} from "./scene-data";
export type LocationId = "home" | "cafe" | "square";
export type Point = { x: number; y: number };
export type Action = { kind:"walk-inside"; to:"activity"|"exit" } | { kind: "move"; to: LocationId } | { kind: "eat" | "rest" | "socialize" | "read" | "wait" | "enter" | "exit" };
export type Decision = { action: Action; reason: string };
export type Npc = {
  id: "aqing" | "aning"; name: string; personality: "outgoing" | "quiet";
  hunger: number; energy: number; mood: number; location: LocationId;
  sceneId: SceneId; facing?: "north"|"south"|"east"|"west"; position: Point; action: string; reason: string; lastPath: Point[];
};
export type TownEvent = { id: number; minute: number; npcId: Npc["id"]; text: string; reason: string };
export type World = {
  schemaVersion: 2; revision: number; name: string; minute: number;
  run?: { running: boolean; nextTickAt: number | null };
  locations: { id: LocationId; name: string; use: string }[];
  npcs: Npc[]; events: TownEvent[];
};
export const MAP = { width: 960, height: 600, roadY: 358 };
export const AUTO_INTERVAL_MS = 5000;
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
  if(building)return {...portalById(building.exit).npcSpawns[id]};
  return { x: second ? 524 : 442, y: second ? 392 : 368 };
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
export function canExecute(npc: Npc, action: Action, world: World): boolean {
  switch (action.kind) {
    case "move": {
      const building=buildingAt(action.to);
      return npc.sceneId==="town" && LOCATIONS.some(l=>l.id===action.to) && (npc.location!==action.to || !!building&&!nearPortal(portalById(building.door),npc.position));
    }
    case "enter": {
      const b=buildingAt(npc.location);if(!b||npc.sceneId!=="town")return false;
      const p=portalById(b.door);return nearPortal(p,npc.position)&&canStand(p.target,p.npcSpawns[npc.id]);
    }
    case "exit": {
      const b=buildingIn(npc.sceneId);if(!b||npc.location!==b.location)return false;
      const p=portalById(b.exit);return nearPortal(p,npc.position)&&canStand(p.target,p.npcSpawns[npc.id]);
    }
    case "walk-inside": {
      if(npc.sceneId!=="home_interior"||npc.location!=="home")return false;
      const path=homePath(npc.id,action.to);
      return samePoint(npc.position,path[0])&&validScenePath(npc.sceneId,path);
    }
    case "eat": return npc.sceneId==="cafe_interior" && npc.location === "cafe";
    case "rest": return npc.sceneId==="home_interior" && npc.location==="home" && samePoint(npc.position,HOME_REST[npc.id].position);
    case "read": return npc.sceneId==="town" && npc.location === "square";
    case "socialize": return npc.sceneId==="town" && npc.location === "square" && world.npcs.some(n => n.id !== npc.id && n.sceneId==="town" && n.location === "square");
    case "wait": return true;
    default: return false;
  }
}
export function decide(npc: Npc, world: World): Decision {
  let target: LocationId = "square";
  let activity: Action = { kind: "read" };
  let reason: string;
  if (npc.sceneId==="home_interior" && samePoint(npc.position,HOME_REST[npc.id].position) && npc.energy<65 && npc.hunger<85) {
    target="home";activity={kind:"rest"};reason=`正在床边恢复，精力 ${npc.energy} 尚未恢复到 65，饥饿 ${npc.hunger} 未到紧急程度。`;
  } else if (npc.energy <= 25 && (npc.hunger < 65 || 100 - npc.energy >= npc.hunger)) {
    target = "home"; activity = { kind: "rest" }; reason = `精力只有 ${npc.energy}，先休息恢复体力。`;
  } else if (npc.hunger >= 65) {
    target = "cafe"; activity = { kind: "eat" }; reason = `饥饿达到 ${npc.hunger}，先去填饱肚子。`;
  } else if (npc.personality === "outgoing" && world.npcs.some(n => n.id !== npc.id && n.sceneId==="town" && n.location === "square")) {
    activity = { kind: "socialize" }; reason = `基本需求满足，心情 ${npc.mood}；喜欢热闹，想与广场上的邻居交流。`;
  } else {
    reason = npc.personality === "quiet" ? `基本需求满足，心情 ${npc.mood}；喜欢安静，读一会儿书。` : "广场暂时没有伙伴，先读书等邻居。";
  }
  const currentBuilding=buildingIn(npc.sceneId),targetBuilding=buildingAt(target);
  let action:Action;
  if(currentBuilding){
    if(currentBuilding.location===target){
      action=target==="home"&&!samePoint(npc.position,HOME_REST[npc.id].position)?{kind:"walk-inside",to:"activity"}:activity;
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
  return [npc.position, { x: npc.position.x, y: MAP.roadY }, { x: end.x, y: MAP.roadY }, end];
}
export function execute(npc: Npc, decision: Decision, world: World): Npc {
  const { action, reason } = decision;
  if (!canExecute(npc, action, world)) throw new Error("非法动作：地点或参与条件不满足");
  const next = structuredClone(npc);
  next.reason = reason;
  next.lastPath = [];
  delete next.facing;
  switch (action.kind) {
    case "move":
      next.lastPath = roadPath(npc, action.to); next.location = action.to;
      next.position = positionAt(action.to, npc.id); next.energy -= 3;
      next.action = `来到${LOCATIONS.find(l => l.id === action.to)!.name}${buildingAt(action.to)?"室外门口":""}`; break;
    case "enter":
    case "exit": {
      const b=action.kind==="enter"?buildingAt(npc.location)!:buildingIn(npc.sceneId)!;
      const portal=portalById(action.kind==="enter"?b.door:b.exit);
      next.sceneId=portal.target;next.position={...portal.npcSpawns[npc.id]};next.facing=portal.facing;
      next.action=action.kind==="enter"?`进入${b.name}`:`离开${b.name}，回到门前`;break;
    }
    case "walk-inside":
      next.lastPath=homePath(npc.id,action.to);next.position={...next.lastPath.at(-1)!};
      next.action=action.to==="activity"?"走到暖灯小屋床边":"走到暖灯小屋出口";break;
    case "eat": next.hunger -= 50; next.energy += 6; break;
    case "rest": next.facing=HOME_REST[npc.id].facing;next.energy += 40; next.mood += 4; break;
    case "socialize": next.mood += 14; next.energy -= 6; break;
    case "read": next.mood += 9; next.energy -= 2; break;
    case "wait": next.energy += 3; break;
  }
  if (action.kind !== "move" && action.kind!=="enter" && action.kind!=="exit" && action.kind!=="walk-inside") next.action = ACTION_LABELS[action.kind];
  next.hunger = clamp(next.hunger); next.energy = clamp(next.energy); next.mood = clamp(next.mood);
  return next;
}
export function advanceWorld(world: World): World {
  const next = structuredClone(world);
  next.minute += 10; next.revision += 1;
  next.npcs = next.npcs.map(n => ({ ...n, hunger: clamp(n.hunger + 8), energy: clamp(n.energy - 6), mood: clamp(n.mood - 2) }));
  // Stable turn order: each later resident sees earlier residents' committed-in-turn moves.
  for (let i = 0; i < next.npcs.length; i++) {
    const n = execute(next.npcs[i], decide(next.npcs[i], next), next);
    next.npcs[i] = n;
    next.events.push({ id: next.revision * 2 - 1 + i, minute: next.minute, npcId: n.id, text: `${n.name} · ${n.action}`, reason: n.reason });
  }
  next.events = next.events.slice(-100);
  return next;
}
export function giveFood(world: World, npcId: string): World {
  const npc = world.npcs.find(n => n.id === npcId);
  if (!npc) throw new Error("居民不存在");
  if (npc.hunger <= 0) throw new Error("居民已经吃饱了，暂不需要食物。");
  const next = structuredClone(world);
  const target = next.npcs.find(n => n.id === npcId)!;
  target.hunger = clamp(target.hunger - FOOD_AMOUNT);
  next.revision += 1;
  next.events.push({ id: next.revision * 2, minute: next.minute, npcId: target.id,
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
  return buildingAt(npc.location)?`${name} · ${npc.sceneId!=="town"?"室内":"室外门口"}`:name;
}
export function assertWorld(value: unknown): asserts value is World {
  const w = value as World;
  if (!w || w.schemaVersion !== 2 || !Number.isSafeInteger(w.revision) || w.revision < 0 || !Number.isSafeInteger(w.minute) || w.minute < 480 || w.npcs?.length !== 2 || !Array.isArray(w.events) || w.locations?.length !== 3 || !LOCATIONS.every((l, i) => w.locations[i].id === l.id && w.locations[i].name === l.name && w.locations[i].use === l.use)) throw new Error("不兼容的世界存档");
  if (new Set(w.npcs.map(n => n.id)).size !== 2) throw new Error("重复的居民存档");
  if (w.run !== undefined && (!w.run || typeof w.run.running !== "boolean" || (w.run.running ? !Number.isSafeInteger(w.run.nextTickAt) || w.run.nextTickAt! < 0 : w.run.nextTickAt !== null))) throw new Error("运行状态存档无效");
  for (const n of w.npcs) {
    if (!["aqing", "aning"].includes(n.id) || !["quiet", "outgoing"].includes(n.personality) || !LOCATIONS.some(l => l.id === n.location) || [n.hunger, n.energy, n.mood].some(v => !Number.isFinite(v) || v < 0 || v > 100) || !validNpcPosition(n) || !Array.isArray(n.lastPath) || (n.sceneId==="cafe_interior"&&n.lastPath.length!==0) || (n.facing!==undefined&&!["north","south","east","west"].includes(n.facing)) || (n.sceneId==="home_interior"&&n.lastPath.length!==0&&(!validScenePath(n.sceneId,n.lastPath)||!samePoint(n.lastPath.at(-1),n.position))) || n.lastPath.some(p=>!Number.isFinite(p.x)||!Number.isFinite(p.y))) throw new Error("居民存档无效");
  }
}
export function worldTime(minute: number): string {
  return `第 ${Math.floor(minute / 1440) + 1} 天 · ${String(Math.floor(minute / 60) % 24).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
}
