import {NEW_BUILDINGS,TOWN_SIZE,TOWN_ROADS,TOWN_PLAZAS,TOWN_LAWNS,TOWN_OBSTACLES} from "./town-map";
import type { Point } from "./world";
import type { Facing } from "./scene-motion";
export type SceneId = "town" | "cafe_interior" | "home_interior" | "store_interior" | "cottage_interior" | `${typeof NEW_BUILDINGS[number]["id"]}_interior`;
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
export const STORE_FURNITURE:Furnishing[]=[
  {kind:"counter",x:638,y:276,width:216,solid:{x:530,y:226,w:216,h:50}},
  {kind:"shelf",x:232,y:246,width:78,solid:{x:193,y:210,w:78,h:36}},
  {kind:"shelf",x:352,y:246,width:78,solid:{x:313,y:210,w:78,h:36}},
  {kind:"shelf",x:232,y:380,width:78,solid:{x:193,y:344,w:78,h:36}},
  {kind:"shelf",x:352,y:380,width:78,solid:{x:313,y:344,w:78,h:36}},
  {kind:"plant",x:752,y:468,width:42,solid:{x:736,y:450,w:32,h:18}},
];
export const COTTAGE_FURNITURE:Furnishing[]=[
  {kind:"bed",x:290,y:328,width:108,solid:{x:236,y:196,w:108,h:132}},
  {kind:"desk",x:666,y:364,width:112,solid:{x:610,y:312,w:112,h:52}},
  {kind:"wardrobe",x:692,y:242,width:84,solid:{x:650,y:192,w:84,h:50}},
  {kind:"fireplace",x:266,y:480,width:96,solid:{x:218,y:430,w:96,h:50}},
  {kind:"plant",x:752,y:468,width:42,solid:{x:736,y:450,w:32,h:18}},
];
type Interior={furniture:Furnishing[];serviceFloor:boolean;rug:number;rugInner:number;caption:string};
const mirror=(items:Furnishing[])=>items.map(f=>({...f,x:960-f.x,solid:{...f.solid,x:960-f.solid.x-f.solid.w}}));
const furnishing=(kind:Furnishing["kind"],x:number,y:number,width:number,w:number,h:number):Furnishing=>({kind,x,y,width,solid:{x:x-w/2,y:y-h,w,h}});
const EXTRA_INTERIORS:Record<`${typeof NEW_BUILDINGS[number]["id"]}_interior`,Interior>={
  hall_interior:{furniture:[furnishing("table",300,330,120,120,62),furnishing("table",660,330,120,120,62),furnishing("desk",480,244,110,110,48),furnishing("plant",230,466,42,32,18)],serviceFloor:false,rug:0x806043,rugInner:0xbfb08a,caption:"晨光会馆 · 公共会客与活动空间"},
  clinic_interior:{furniture:[HOME_FURNITURE[0],HOME_FURNITURE[1],furnishing("desk",650,460,112,112,52),furnishing("shelf",240,456,66,66,32)],serviceFloor:true,rug:0x587a76,rugInner:0xaac8ba,caption:"河风诊所 · 休养床位与登记桌"},
  library_interior:{furniture:[...STORE_FURNITURE.slice(1,5),furnishing("shelf",700,244,90,90,40),furnishing("desk",648,380,122,122,56)],serviceFloor:false,rug:0x71594d,rugInner:0xb5a079,caption:"青叶书屋 · 书架与安静阅读角"},
  workshop_interior:{furniture:[furnishing("counter",300,286,210,210,56),furnishing("desk",670,372,140,140,62),furnishing("wardrobe",236,452,84,84,50),furnishing("shelf",704,228,84,84,36)],serviceFloor:true,rug:0x836249,rugInner:0xbd9965,caption:"杉木工坊 · 工作台与工具储物"},
  rose_interior:{furniture:[...COTTAGE_FURNITURE.slice(0,3),furnishing("plant",246,468,44,34,20)],serviceFloor:false,rug:0x955c63,rugInner:0xc3998c,caption:"蔷薇居 · 花窗与独立卧室"},
  sage_interior:{furniture:[COTTAGE_FURNITURE[0],furnishing("shelf",696,244,90,90,40),furnishing("table",654,402,110,110,58),COTTAGE_FURNITURE[3]],serviceFloor:false,rug:0x5d704e,rugInner:0xacb68b,caption:"苔色小院 · 餐桌与炉边"},
  reed_interior:{furniture:[COTTAGE_FURNITURE[0],furnishing("desk",680,462,110,110,52),furnishing("wardrobe",686,270,84,84,50),furnishing("plant",234,470,42,32,18)],serviceFloor:false,rug:0x8e7950,rugInner:0xd1bd83,caption:"芦苇屋 · 河岸小家"},
  stone_interior:{furniture:mirror(COTTAGE_FURNITURE),serviceFloor:false,rug:0x536c80,rugInner:0xa4b8ba,caption:"石溪居 · 石墙暖炉与右侧卧室"},
};
export const INTERIORS:Record<Exclude<SceneId,"town">,Interior>={
  ...EXTRA_INTERIORS,
  cafe_interior:{furniture:CAFE_FURNITURE,serviceFloor:true,rug:0xa76240,rugInner:0xc49c65,caption:"木香与咖啡 · 独立室内场景"},
  home_interior:{furniture:HOME_FURNITURE,serviceFloor:false,rug:0x536747,rugInner:0x9baf78,caption:"暖灯与木香 · 居民的家"},
  store_interior:{furniture:STORE_FURNITURE,serviceFloor:true,rug:0x995940,rugInner:0xcdaf79,caption:"木柜与货架 · 自由探索"},
  cottage_interior:{furniture:COTTAGE_FURNITURE,serviceFloor:false,rug:0x496d73,rugInner:0x9db5ab,caption:"青瓦与小庭院 · 自由探索"},
};
// Both player and backend NPC execution use these exact paired portals.
const extraPortals:Portal[]=NEW_BUILDINGS.flatMap(b=>[
  {id:b.id+"-door",source:"town",reverseId:b.id+"-exit",position:{x:b.x,y:b.y+13},radius:20,target:`${b.id}_interior`,spawn:{x:480,y:486},npcSpawns:{aqing:{x:460,y:486},aning:{x:500,y:486}},facing:"north",label:`进入${b.name}`},
  {id:b.id+"-exit",source:`${b.id}_interior`,reverseId:b.id+"-door",position:{x:480,y:494},radius:22,target:"town",spawn:{x:b.x,y:b.y+17},npcSpawns:{aqing:{x:b.x-8,y:b.y+17},aning:{x:b.x+8,y:b.y+17}},facing:"south",label:`回到${b.name}门前`},
]);
export const PORTALS:Portal[] = [
  ...extraPortals,
  {id:"cafe-door",source:"town",reverseId:"cafe-exit",position:{x:762,y:320},radius:20,target:"cafe_interior",spawn:{x:480,y:486},npcSpawns:{aqing:{x:460,y:486},aning:{x:500,y:486}},facing:"north",label:"进入麦香咖啡馆"},
  {id:"cafe-exit",source:"cafe_interior",reverseId:"cafe-door",position:{x:480,y:494},radius:22,target:"town",spawn:{x:762,y:324},npcSpawns:{aqing:{x:754,y:324},aning:{x:770,y:324}},facing:"south",label:"回到街角"},
  {id:"home-door",source:"town",reverseId:"home-exit",position:{x:226,y:320},radius:20,target:"home_interior",spawn:{x:480,y:486},npcSpawns:{aqing:{x:460,y:486},aning:{x:500,y:486}},facing:"north",label:"进入暖灯小屋"},
  {id:"home-exit",source:"home_interior",reverseId:"home-door",position:{x:480,y:494},radius:22,target:"town",spawn:{x:226,y:324},npcSpawns:{aqing:{x:218,y:324},aning:{x:234,y:324}},facing:"south",label:"回到街角"},
  {id:"store-door",source:"town",reverseId:"store-exit",position:{x:1158,y:320},radius:20,target:"store_interior",spawn:{x:480,y:486},npcSpawns:{aqing:{x:460,y:486},aning:{x:500,y:486}},facing:"north",label:"进入石榴杂货铺"},
  {id:"store-exit",source:"store_interior",reverseId:"store-door",position:{x:480,y:494},radius:22,target:"town",spawn:{x:1158,y:324},npcSpawns:{aqing:{x:1150,y:324},aning:{x:1166,y:324}},facing:"south",label:"回到榴木街"},
  {id:"cottage-door",source:"town",reverseId:"cottage-exit",position:{x:1510,y:520},radius:20,target:"cottage_interior",spawn:{x:480,y:486},npcSpawns:{aqing:{x:460,y:486},aning:{x:500,y:486}},facing:"north",label:"进入青篱小居"},
  {id:"cottage-exit",source:"cottage_interior",reverseId:"cottage-door",position:{x:480,y:494},radius:22,target:"town",spawn:{x:1510,y:524},npcSpawns:{aqing:{x:1502,y:524},aning:{x:1518,y:524}},facing:"south",label:"回到榴木街"},
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
type SceneDefinition={name:string;size:{width:number;height:number};walkable:Box[];obstacles:Box[];portals:Portal[];art:string};
const extraScenes=Object.fromEntries(NEW_BUILDINGS.map(b=>{const id=`${b.id}_interior` as const;return [id,{name:b.name+" · 室内",size:{width:960,height:600},art:"/art/v7-2/home-furniture.png",walkable:[{x:172,y:166,w:616,h:346}],obstacles:INTERIORS[id].furniture.map(f=>f.solid),portals:PORTALS.filter(p=>p.source===id)}];})) as Record<`${typeof NEW_BUILDINGS[number]["id"]}_interior`,SceneDefinition>;
export const SCENES:Record<SceneId,SceneDefinition> = {
  ...extraScenes,
  town:{name:"晨露村 · 老街、公共街与河岸",size:TOWN_SIZE,art:"/art/v4-1/town-atlas.png",
    walkable:[...TOWN_ROADS,...TOWN_PLAZAS,...TOWN_LAWNS],obstacles:TOWN_OBSTACLES,portals:PORTALS.filter(p=>p.source==="town")},
  cafe_interior:{name:"麦香咖啡馆 · 室内",size:{width:960,height:600},art:"/art/v6-1/cafe-furniture.png",
    walkable:[{x:172,y:166,w:616,h:346}],obstacles:CAFE_FURNITURE.map(f=>f.solid),portals:PORTALS.filter(p=>p.source==="cafe_interior")},
  home_interior:{name:"暖灯小屋 · 室内",size:{width:960,height:600},art:"/art/v7-2/home-furniture.png",
    walkable:[{x:172,y:166,w:616,h:346}],obstacles:HOME_FURNITURE.map(f=>f.solid),portals:PORTALS.filter(p=>p.source==="home_interior")},
  store_interior:{name:"石榴杂货铺 · 室内",size:{width:960,height:600},art:"/art/v6-1/cafe-furniture.png",
    walkable:[{x:172,y:166,w:616,h:346}],obstacles:STORE_FURNITURE.map(f=>f.solid),portals:PORTALS.filter(p=>p.source==="store_interior")},
  cottage_interior:{name:"青篱小居 · 室内",size:{width:960,height:600},art:"/art/v7-2/home-furniture.png",
    walkable:[{x:172,y:166,w:616,h:346}],obstacles:COTTAGE_FURNITURE.map(f=>f.solid),portals:PORTALS.filter(p=>p.source==="cottage_interior")},

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
  if(path.length<2||path.length>64)return false;
  for(let i=1;i<path.length;i++){
    const a=path[i-1],b=path[i];
    if(!Number.isFinite(a.x+a.y+b.x+b.y)||(a.x!==b.x&&a.y!==b.y))return false;
    const steps=Math.max(1,Math.ceil(Math.hypot(b.x-a.x,b.y-a.y)/2));
    for(let k=0;k<=steps;k++)if(!canStand(sceneId,{x:a.x+(b.x-a.x)*k/steps,y:a.y+(b.y-a.y)*k/steps}))return false;
  }
  return true;
}
