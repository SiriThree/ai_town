import type {Player} from "./player-scene";
import {SCENES,validScenePath} from "./scene-data";
import type {Npc,Point,World} from "./world";
import {activeConversation} from "./social";
// Existing cafe-side chalkboard from town-dressing, not a new world object.
import {STREET_PROPS} from "./town-dressing";
export const NOTICE_BOARD=STREET_PROPS.find(p=>p.kind==="sign")!;
export const TALK_RADIUS=76;
export type Interaction={kind:"portal"|"npc"|"notice";id:string;position:Point;label:string;distance:number};
export function nearbyResidents(player:Player,npcs:Npc[],positions:Record<string,Point>={}):Npc[]{
  return npcs.filter(n=>{
    const p=positions[n.id]??n.position;
    if(n.sceneId!==player.sceneId||Math.hypot(p.x-player.position.x,p.y-player.position.y)>TALK_RADIUS)return false;
    // Short L-shaped visibility paths use the same collision data, so walls/furniture
    // cannot offer a conversation merely because the screen-space distance is small.
    return validScenePath(player.sceneId,[player.position,{x:p.x,y:player.position.y},p])||validScenePath(player.sceneId,[player.position,{x:player.position.x,y:p.y},p]);
  });
}
export function interactionTarget(player:Player,npcs:Npc[],positions:Record<string,Point>={}):Interaction|null{
  const distance=(p:Point)=>Math.hypot(p.x-player.position.x,p.y-player.position.y);
  const targets:Interaction[]=SCENES[player.sceneId].portals.filter(p=>distance(p.position)<=p.radius).map(p=>({kind:"portal",id:p.id,position:p.position,label:p.label,distance:distance(p.position)}));
  for(const n of nearbyResidents(player,npcs,positions)){const p=positions[n.id]??n.position;targets.push({kind:"npc",id:n.id,position:p,label:`与${n.name}交谈`,distance:distance(p)});}
  if(player.sceneId==="town"&&distance(NOTICE_BOARD)<=68)targets.push({kind:"notice",id:"cafe-board",position:NOTICE_BOARD,label:"阅读街角公告",distance:distance(NOTICE_BOARD)});
  // Facing modestly prefers the target in front; deterministic ties choose a door.
  const forward={north:{x:0,y:-1},south:{x:0,y:1},east:{x:1,y:0},west:{x:-1,y:0}}[player.facing];
  const score=(t:Interaction)=>t.distance-8*((t.position.x-player.position.x)*forward.x+(t.position.y-player.position.y)*forward.y)/Math.max(1,t.distance);
  // A resident standing on the doorstep must not prevent entering the building.
  return targets.sort((a,b)=>(a.kind==="portal"&&b.kind!=="portal"?-1:b.kind==="portal"&&a.kind!=="portal"?1:0)||score(a)-score(b)||a.id.localeCompare(b.id))[0]??null;
}
export function busyReason(n:Npc,w:World):string|null {
  if(activeConversation(w,n.id))return `${n.name}正在和邻居交谈，请等这段话说完。`;
  if(n.ongoing?.path.length)return `${n.name}正在赶路，停下后再聊吧。`;
  if(n.ongoing&&["work","help","rest","eat"].includes(n.ongoing.decision.action.kind))return `${n.name}正在${n.ongoing.decision.action.kind==="rest"?"休息":"忙手边的事"}，稍后再聊。`;
  return null;
}
