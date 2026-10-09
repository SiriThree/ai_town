import type { Point } from "./world";
import type { Facing } from "./scene-motion";
export type SceneId = "town" | "cafe_interior";
export type Box = { x:number; y:number; w:number; h:number };
type Portal = { id:string; position:Point; radius:number; target:SceneId; spawn:Point; facing:Facing; label:string };
export type Furnishing = { kind:"counter"|"table"|"shelf"|"plant"; x:number; y:number; width:number; solid:Box };
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
export const SCENES:Record<SceneId,{name:string;walkable:Box[];obstacles:Box[];portals:Portal[];art:string}> = {
  town:{name:"晨露村 · 街角",art:"/art/v4-1/town-atlas.png",
    walkable:[{x:80,y:332,w:810,h:78},{x:182,y:300,w:85,h:65},{x:720,y:300,w:84,h:65},{x:355,y:288,w:255,h:194}],
    obstacles:[{x:446,y:423,w:68,h:40},{x:369,y:441,w:51,h:24},{x:551,y:441,w:51,h:24}],
    portals:[{id:"cafe-door",position:{x:762,y:320},radius:20,target:"cafe_interior",spawn:{x:480,y:486},facing:"north",label:"进入麦香咖啡馆"}]},
  cafe_interior:{name:"麦香咖啡馆 · 室内",art:"/art/v6-1/cafe-furniture.png",
    walkable:[{x:172,y:166,w:616,h:346}],obstacles:CAFE_FURNITURE.map(f=>f.solid),
    portals:[{id:"cafe-exit",position:{x:480,y:494},radius:22,target:"town",spawn:{x:762,y:324},facing:"south",label:"回到街角"}]},
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

export const npcCafeSpawn=(id:string):Point=>({x:id==="aning"?500:460,y:486});
export const nearDoor=(sceneId:SceneId,p:Point)=>{const door=SCENES[sceneId].portals[0];return Math.hypot(p.x-door.position.x,p.y-door.position.y)<=door.radius;};
