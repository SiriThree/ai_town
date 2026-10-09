import type {Decision, Point} from "./world";
import type {SceneId} from "./scene-data";

// One real second advances two town minutes. Fixed rate; no offline catch-up.
export const STEP_MS = 1000;
export const STEP_MINUTES = 2;
export const WALK_SPEED = 80; // world units / real second; independent of route length
export type OngoingAction = {
  id:string; decision:Decision; sceneId:SceneId; startedMinute:number;
  elapsedMs:number; durationMs:number; path:Point[];
};
export const pathLength=(path:Point[])=>path.slice(1).reduce((sum,p,i)=>sum+Math.hypot(p.x-path[i].x,p.y-path[i].y),0);
export function pathPoint(path:Point[],distance:number):Point {
  let left=Math.max(0,distance);
  for(let i=1;i<path.length;i++){
    const a=path[i-1],b=path[i],length=Math.hypot(b.x-a.x,b.y-a.y);
    if(length && left<length)return {x:a.x+(b.x-a.x)*left/length,y:a.y+(b.y-a.y)*left/length};
    left-=length;
  }
  return {...path.at(-1)!};
}
// Only the already traversed, server-confirmed part is animated by browsers.
export function pathSection(path:Point[],from:number,to:number):Point[]{
  const points=[pathPoint(path,from)];let distance=0;
  for(let i=1;i<path.length;i++){distance+=Math.hypot(path[i].x-path[i-1].x,path[i].y-path[i-1].y);if(distance>from&&distance<to)points.push({...path[i]});}
  points.push(pathPoint(path,to));return points.filter((p,i)=>!i||p.x!==points[i-1].x||p.y!==points[i-1].y);
}
export function actionDuration(kind:Decision["action"]["kind"],path:Point[]):number {
  if(path.length>1)return Math.max(STEP_MS,pathLength(path)/WALK_SPEED*1000);
  return ({work:8000,help:8000,rest:12000,eat:8000,read:6000,socialize:6000,wait:2000} as Partial<Record<typeof kind,number>>)[kind]??STEP_MS;
}
