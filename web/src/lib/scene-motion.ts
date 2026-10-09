import type { SceneId } from "./scene-data";
import { MAP, type Npc, type Point } from "./world";

export const ART_PIXEL = 2;
export const RESIDENT_HEIGHT = 64;
export type Facing = "south" | "west" | "east" | "north";
export type Pose = { position:Point; facing:Facing; moving:boolean; frame:number };
export type Motion = { sceneId:SceneId; target:Point; points:Point[]; startedAt:number; duration:number; facing:Facing };
const same=(a:Point,b:Point)=>a.x===b.x&&a.y===b.y;
const distance=(a:Point,b:Point)=>Math.abs(a.x-b.x)+Math.abs(a.y-b.y);
const direction=(a:Point,b:Point):Facing=>a.x!==b.x?(b.x>a.x?"east":"west"):(b.y>a.y?"south":"north");
export const snapPixel=(value:number)=>Math.round(value/ART_PIXEL)*ART_PIXEL;
export function stillAt(position:Point,facing:Facing="south",sceneId:SceneId="town"):Motion {
  return {sceneId,target:{...position},points:[{...position}],startedAt:0,duration:0,facing};
}
function sample(m:Motion,now:number) {
  const progress=m.duration?Math.max(0,Math.min(1,(now-m.startedAt)/m.duration)):1;
  const lengths=m.points.slice(1).map((p,i)=>distance(m.points[i],p));
  let remaining=lengths.reduce((sum,n)=>sum+n,0)*progress;
  for(let i=0;i<lengths.length;i++) {
    if(remaining<lengths[i]) {
      const a=m.points[i],b=m.points[i+1],t=remaining/lengths[i];
      return {position:{x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t},facing:direction(a,b),segment:i,moving:true};
    }
    remaining-=lengths[i];
  }
  const last=m.points.length-1;
  return {position:m.target,facing:last?direction(m.points[last-1],m.target):m.facing,segment:last,moving:false};
}
export function poseAt(m:Motion,now:number):Pose {
  const p=sample(m,now);
  return {position:{x:snapPixel(p.position.x),y:snapPixel(p.position.y)},facing:p.facing,moving:p.moving,frame:p.moving?[0,1,0,2][Math.floor(Math.max(0,now-m.startedAt)/140)%4]:0};
}
// Accept only the current backend's actual corridor path; never synthesize a detour.
export function acceptPosition(m:Motion,npc:Pick<Npc,"position"|"lastPath"> & {sceneId?:SceneId},now:number):Motion {
  const sceneId=npc.sceneId??"town";
  if(sceneId!==m.sceneId)return stillAt(npc.position,"south",sceneId);
  if(same(m.target,npc.position))return m; // polling, selection, feeding and run toggles do not replay a path
  const p=npc.lastPath;
  const expected=[m.target,{x:m.target.x,y:MAP.roadY},{x:npc.position.x,y:MAP.roadY},npc.position];
  if(p.length!==4||p.some((point,i)=>!same(point,expected[i])||!Number.isFinite(point.x)||!Number.isFinite(point.y)||point.x<0||point.x>MAP.width||point.y<0||point.y>MAP.height))return stillAt(npc.position,"south",sceneId);
  const current=sample(m,now);
  // Rapid manual commits keep the unplayed old route, then the newly committed route.
  // There is no extrapolation, independent simulation or unbounded offline queue.
  const points=(current.moving?[current.position,...m.points.slice(current.segment+1),...p.slice(1)]:p).filter((point,i,all)=>i===0||!same(point,all[i-1]));
  if(points.length>16)return stillAt(npc.position,current.facing,sceneId);
  const length=points.slice(1).reduce((sum,point,i)=>sum+distance(points[i],point),0);
  return {sceneId,target:{...npc.position},points:points.map(point=>({...point})),startedAt:now,duration:Math.min(3000,Math.max(400,length/0.15)),facing:current.facing};
}
