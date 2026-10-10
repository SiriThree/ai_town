import {TOWN_BUILDINGS} from './town-map';
import {buildingAt,portalById,portalSpawn,canStand,type SceneId} from './scene-data';
import {positionAt,homeOf,type LocationId,type Npc,type Point,type World} from './world';

// Content policy only. Coordinates, portals and paths remain owned by the existing scenes.
const privateHomes:LocationId[]=['home','cottage','rose','sage','reed','stone'];
export const MEETING_PLACES=[
 {id:'square' as LocationId,name:'树荫广场',aliases:['树荫广场','广场'],access:'public' as const,anchor:'outdoor' as const,radius:75,capabilities:['meet','socialize','read']},
 ...TOWN_BUILDINGS.map(b=>({id:b.id,name:b.name,aliases:[b.name,...(b.id==='cafe'?['咖啡馆']:[])],access:privateHomes.includes(b.id)?'host' as const:'public' as const,anchor:'entrance' as const,radius:28,capabilities:['meet',...(['cafe','store'].includes(b.id)?['help']:[])]})),
];
export const isMeetingPlace=(value:unknown):value is LocationId=>typeof value==='string'&&MEETING_PLACES.some(p=>p.id===value);
export const meetingName=(id:LocationId)=>MEETING_PLACES.find(p=>p.id===id)?.name??'约定地点';
export function meetingPlace(id:LocationId,npcId:string):{sceneId:SceneId;position:Point;radius:number}|null{
 const p=MEETING_PLACES.find(p=>p.id===id);if(!p)return null;
 if(p.anchor==='outdoor')return {sceneId:'town',position:positionAt(id,npcId),radius:p.radius};
 const b=buildingAt(id);if(!b)return null;
 return {sceneId:portalById(b.door).target,position:portalSpawn(b.door,npcId),radius:p.radius};
}
export function meetingAccess(target:LocationId,n:Npc,w:World):string|null{
 const p=MEETING_PLACES.find(p=>p.id===target),spot=meetingPlace(target,n.id);
 if(!p||!w.locations.some(l=>l.id===target)||!spot||!canStand(spot.sceneId,spot.position))return '这个地点没有合法的会面位置。';
 if(p.access==='host'&&homeOf(n)!==target)return '这是其他居民的私人住宅，我不能在那里安排会面。';
 return null;
}
export function atMeetingPlace(n:Npc,target:LocationId):boolean{
 const p=meetingPlace(target,n.id);return !!p&&n.sceneId===p.sceneId&&n.location===target&&Math.hypot(n.position.x-p.position.x,n.position.y-p.position.y)<=p.radius;
}
