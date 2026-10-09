import type { Point } from "./world";
import type { Facing } from "./scene-motion";
export type SceneId = "town" | "cafe_interior" | "home_interior";
export type Box = { x:number; y:number; w:number; h:number };
export type Portal = { id:string; source:SceneId; reverseId:string; npcSpawns:Record<"aqing"|"aning",Point>; position:Point; radius:number; target:SceneId; spawn:Point; facing:Facing; label:string };
export type Furnishing = { kind:"counter"|"table"|"shelf"|"plant"|"bed"|"desk"|"wardrobe"|"fireplace"; x:number; y:number; width:number; solid:Box };
export const CAFE_FURNITURE:Furnishing[] = [
  {kind:"counter",x:360,y:250,width:220,solid:{x:250,y:204,w:220,h:46}},
  {kind:"shelf",x:210,y:220,width:64,solid:{x:178,y:192,w:64,h:28}},
  {kind:"shelf",x:722,y:220,width:64,solid:{x:690,y:192,w:64,h:28}},
  {kind:"table",x:320,y:367,width:110,solid:{x:265,y:309,w:110,h:58}},
  {kind:"table",x:642,y:345,width:110,solid:{x:587,y:287,w:110,h:58}},
  {kind:"table",x:663,y:455,width:110,solid:{x:608,y:397,w:110,h:58}},
  {kind:"plant",x:206,y:476,width:42,solid:{x:190,y:458,w:32,h:18}},
  {kind:"plant",x:763,y:476,width:42,solid:{x:747,y:458,w:32,h:18}},
];
export const HOME_FURNITURE:Furnishing[] = [
  {kind:"bed",x:290,y:328,width:108,solid:{x:236,y:196,w:108,h:132}},
  {kind:"bed",x:670,y:328,width:108,solid:{x:616,y:196,w:108,h:132}},
  {kind:"wardrobe",x:480,y:272,width:84,solid:{x:438,y:222,w:84,h:50}},
  {kind:"desk",x:682,y:466,width:112,solid:{x:626,y:414,w:112,h:52}},
  {kind:"fireplace",x:246,y:468,width:96,solid:{x:198,y:418,w:96,h:50}},
];
// Both player and backend NPC execution use these exact paired portals.
export const PORTALS:Portal[] = [
  {id:"cafe-door",source:"town",reverseId:"cafe-exit",position:{x:762,y:320},radius:20,target:"cafe_interior",spawn:{x:480,y:486},npcSpawns:{aqing:{x:460,y:486},aning:{x:500,y:486}},facing:"north",label:"进入麦香咖啡馆"},
  {id:"cafe-exit",source:"cafe_interior",reverseId:"cafe-door",position:{x:480,y:494},radius:22,target:"town",spawn:{x:762,y:324},npcSpawns:{aqing:{x:754,y:324},aning:{x:770,y:324}},facing:"south",label:"回到街角"},
  {id:"home-door",source:"town",reverseId:"home-exit",position:{x:226,y:320},radius:20,target:"home_interior",spawn:{x:480,y:486},npcSpawns:{aqing:{x:460,y:486},aning:{x:500,y:486}},facing:"north",label:"进入暖灯小屋"},
  {id:"home-exit",source:"home_interior",reverseId:"home-door",position:{x:480,y:494},radius:22,target:"town",spawn:{x:226,y:324},npcSpawns:{aqing:{x:218,y:324},aning:{x:234,y:324}},facing:"south",label:"回到街角"},
];
export const portalById=(id:string)=>PORTALS.find(p=>p.id===id)!;
export const nearPortal=(p:Portal,position:Point)=>Math.hypot(position.x-p.position.x,position.y-p.position.y)<=p.radius;
export const BUILDINGS = [
  {location:"cafe",name:"麦香咖啡馆",sceneId:"cafe_interior",door:"cafe-door",exit:"cafe-exit"},
  {location:"home",name:"暖灯小屋",sceneId:"home_interior",door:"home-door",exit:"home-exit"},
] as const;
export const buildingAt=(location:string)=>BUILDINGS.find(b=>b.location===location);
export const buildingIn=(sceneId:SceneId)=>BUILDINGS.find(b=>b.sceneId===sceneId);
export const HOME_REST:Record<"aqing"|"aning",{position:Point;facing:Facing}> = {
  aqing:{position:{x:370,y:300},facing:"west"},aning:{position:{x:588,y:300},facing:"east"},
};
// Authored, collision-checked routes to the two beds' walkable neighbours, not bed centres.
export function homePath(id:"aqing"|"aning",to:"activity"|"exit"):Point[] {
  const start=portalById("home-door").npcSpawns[id],end=HOME_REST[id].position;
  const path=[start,{x:start.x,y:400},{x:end.x,y:400},end];
  return (to==="activity"?path:path.toReversed()).map(p=>({...p}));
}
export const SCENES:Record<SceneId,{name:string;walkable:Box[];obstacles:Box[];portals:Portal[];art:string}> = {
  town:{name:"晨露村 · 街角",art:"/art/v4-1/town-atlas.png",
    walkable:[{x:80,y:332,w:810,h:78},{x:182,y:300,w:85,h:65},{x:720,y:300,w:84,h:65},{x:355,y:288,w:255,h:194}],
    obstacles:[{x:446,y:423,w:68,h:40},{x:369,y:441,w:51,h:24},{x:551,y:441,w:51,h:24}],portals:PORTALS.filter(p=>p.source==="town")},
  cafe_interior:{name:"麦香咖啡馆 · 室内",art:"/art/v6-1/cafe-furniture.png",
    walkable:[{x:172,y:166,w:616,h:346}],obstacles:CAFE_FURNITURE.map(f=>f.solid),portals:PORTALS.filter(p=>p.source==="cafe_interior")},
  home_interior:{name:"暖灯小屋 · 室内",art:"/art/v7-2/home-furniture.png",
    walkable:[{x:172,y:166,w:616,h:346}],obstacles:HOME_FURNITURE.map(f=>f.solid),portals:PORTALS.filter(p=>p.source==="home_interior")},
};

export const PLAYER_RADIUS=9;
const inside=(p:Point,b:Box)=>p.x>=b.x&&p.x<=b.x+b.w&&p.y>=b.y&&p.y<=b.y+b.h;
export function canStand(sceneId:SceneId,p:Point):boolean {
  if(!Number.isFinite(p.x)||!Number.isFinite(p.y))return false;
  const scene=SCENES[sceneId];
  // Test the feet footprint against the union of connected floor rectangles.
  const samples=[[0,0],[-9,0],[9,0],[0,-9],[0,9],[-6,-6],[6,-6],[-6,6],[6,6]];
  if(samples.some(([x,y])=>!scene.walkable.some(b=>inside({x:p.x+x,y:p.y+y},b))))return false;
  return !scene.obstacles.some(b=>p.x+PLAYER_RADIUS>b.x&&p.x-PLAYER_RADIUS<b.x+b.w&&p.y+PLAYER_RADIUS>b.y&&p.y-PLAYER_RADIUS<b.y+b.h);
}

export const npcCafeSpawn=(id:string):Point=>portalById("cafe-door").npcSpawns[id==="aning"?"aning":"aqing"];
export const nearDoor=(sceneId:SceneId,p:Point)=>SCENES[sceneId].portals.some(door=>nearPortal(door,p));
export function validScenePath(sceneId:SceneId,path:Point[]):boolean {
  if(path.length<2||path.length>16)return false;
  for(let i=1;i<path.length;i++){
    const a=path[i-1],b=path[i];
    if(!Number.isFinite(a.x+a.y+b.x+b.y)||(a.x!==b.x&&a.y!==b.y))return false;
    const steps=Math.max(1,Math.ceil(Math.hypot(b.x-a.x,b.y-a.y)/2));
    for(let k=0;k<=steps;k++)if(!canStand(sceneId,{x:a.x+(b.x-a.x)*k/steps,y:a.y+(b.y-a.y)*k/steps}))return false;
  }
  return true;
}
