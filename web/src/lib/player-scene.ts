import type { Point, Npc } from "./world";
import type { Facing, Pose } from "./scene-motion";

import { SCENES,PORTALS,canStand,type SceneId } from "./scene-data";
export {SCENES,CAFE_FURNITURE,canStand,PLAYER_RADIUS,type SceneId,type Furnishing} from "./scene-data";
export type Player = { version:1; sceneId:SceneId; position:Point; facing:Facing };
export const PLAYER_KEY="morning-town:player:v1";
export const PLAYER_SPEED=132;
export const newPlayer=():Player=>({version:1,sceneId:"town",position:{x:620,y:370},facing:"south"});
export function restorePlayer(value:unknown):Player {
  const v=value as Partial<Player>|null;
  if(v?.version!==1 || (!v.sceneId||!Object.hasOwn(SCENES,v.sceneId)))return newPlayer();
  const facing:Facing=["north","south","west","east"].includes(v.facing||"")?v.facing!:"south";
  const position=v.position;
  if(position&&canStand(v.sceneId,position))return {version:1,sceneId:v.sceneId,position:{...position},facing};
  const entrance=PORTALS.find(p=>p.source==="town"&&p.target===v.sceneId);
  return entrance?{version:1,sceneId:v.sceneId,position:{...entrance.spawn},facing:entrance.facing}:newPlayer();
}
export function movePlayer(player:Player,dx:number,dy:number,seconds:number):Player {
  if(!dx&&!dy)return player;
  if(!Number.isFinite(dx+dy+seconds))return player;
  const length=Math.hypot(dx,dy),distance=PLAYER_SPEED*Math.max(0,Math.min(.05,seconds));
  const x=dx/length*distance,y=dy/length*distance;
  const facing:Facing=Math.abs(dx)>Math.abs(dy)?(dx>0?"east":"west"):(dy>0?"south":"north");
  let position={...player.position};
  // <=2-unit substeps prevent tunnelling even at low frame rates; slide along a blocked axis.
  const steps=Math.max(1,Math.ceil(distance/2));
  for(let i=0;i<steps;i++){
    const px={x:position.x+x/steps,y:position.y};if(canStand(player.sceneId,px))position=px;
    const py={x:position.x,y:position.y+y/steps};if(canStand(player.sceneId,py))position=py;
  }
  return {...player,position,facing};
}
export function nearbyPortal(player:Player) {
  return SCENES[player.sceneId].portals.find(p=>Math.hypot(p.position.x-player.position.x,p.position.y-player.position.y)<=p.radius) ?? null;
}
export function enterPortal(player:Player,id:string):Player {
  const portal=nearbyPortal(player);
  if(!portal||portal.id!==id||!canStand(portal.target,portal.spawn))return player;
  return {version:1,sceneId:portal.target,position:{...portal.spawn},facing:portal.facing};
}
export const playerPose=(player:Player,moving:boolean,now:number):Pose=>({position:{x:Math.round(player.position.x/2)*2,y:Math.round(player.position.y/2)*2},facing:player.facing,moving,frame:moving?[0,1,0,2][Math.floor(now/140)%4]:0});
export function residentScene(npc:Npc):SceneId { return npc.sceneId; }
