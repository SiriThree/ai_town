import { Assets,Container,Graphics,Rectangle,Sprite,Texture } from "pixi.js";
import type { Pose } from "../lib/scene-motion";
import { CAFE_FURNITURE, HOME_FURNITURE, type SceneId } from "../lib/scene-data";
import playerFrames from "./player-frames.json";
import homeFrames from "./home-frames.json";
import cafeFrames from "./cafe-frames.json";
export async function loadPlayerArt(){
  const [player,cafe,home]=await Promise.all([Assets.load<Texture>("/art/v6-1/player-walk.png"),Assets.load<Texture>("/art/v6-1/cafe-furniture.png"),Assets.load<Texture>("/art/v7-2/home-furniture.png")]);
  player.source.scaleMode=cafe.source.scaleMode=home.source.scaleMode="nearest";
  const crop=(t:Texture,[x,y,w,h]:number[])=>new Texture({source:t.source,frame:new Rectangle(x,y,w,h)});
  return {player:Object.fromEntries(Object.entries(playerFrames).map(([key,frames])=>[key,frames.map(f=>crop(player,f))])) as Record<Pose["facing"],Texture[]>,
    furniture:Object.fromEntries([...Object.entries(cafeFrames).map(([key,frame])=>[key,crop(cafe,frame)]),...Object.entries(homeFrames).map(([key,frame])=>[key,crop(home,frame)])]) as Record<keyof typeof cafeFrames|keyof typeof homeFrames,Texture>};
}
type Art=Awaited<ReturnType<typeof loadPlayerArt>>;
export function drawPlayer(art:Art){
  const node=new Container(),shadow=new Graphics(),ring=new Graphics(),figure=new Sprite(art.player.south[0]);
  shadow.ellipse(3,1,13,5).fill({color:0x302f26,alpha:.3});
  ring.ellipse(0,0,17,7).stroke({color:0xc1e4ce,width:2});figure.anchor.set(.5,1);node.addChild(shadow,ring,figure);
  let previous="";
  return {node,update:(pose:Pose)=>{
    const signature=JSON.stringify(pose);if(signature===previous)return false;previous=signature;
    node.position.set(pose.position.x,pose.position.y);node.zIndex=pose.position.y;
    // The generated west row has a wrong-facing frame; consistently mirror the verified east row.
    figure.texture=art.player[pose.facing==="west"?"east":pose.facing][pose.frame];
    figure.scale.set(1);figure.height=64;figure.width=Math.round(64*figure.texture.width/figure.texture.height/2)*2;
    if(pose.facing==="west")figure.scale.x=-Math.abs(figure.scale.x);
    return true;
  }};
}
const box=(g:Graphics,x:number,y:number,w:number,h:number,color:number)=>g.rect(x,y,w,h).fill(color);
export function drawInterior(art:Art,sceneId:Exclude<SceneId,"town">){
  const home=sceneId==="home_interior";
  const ground=new Container(),objects=new Container();objects.sortableChildren=true;
  const g=new Graphics();ground.addChild(g);
  box(g,0,0,960,600,0x30332d);box(g,162,102,648,438,0x24251f);
  box(g,160,148,640,374,0x70503a);
  // Original deterministic timber floor, same two-world-unit raster as town.
  for(let row=0;row<19;row++)for(let col=0;col<7;col++){
    const x=160+col*100-(row%2)*50,y=148+row*20,left=Math.max(160,x),right=Math.min(800,x+98);
    if(right<=left)continue;
    const color=[0x997046,0x9f764a,0xa27a4f,0x8f6942][(row*3+col)%4];
    box(g,left,y,right-left,18,color);box(g,left,y,right-left,2,0xb68c5b);
    for(let i=0;i<4;i++){const xx=left+8+i*18;if(xx+10<right)box(g,xx,y+6+(i%2)*4,10,2,0x8c633e);}
  }
  // Stone service floor at the rear, and a woven runner down the unobstructed centre.
  if(!home)for(let y=150;y<260;y+=22)for(let x=170;x<790;x+=24){box(g,x,y,22,20,(x+y)%3?0xc0ab87:0xb5a07c);box(g,x,y,22,2,0xd0bc98);}
  box(g,426,308,110,152,0x69573d);box(g,430,310,102,148,home?0x536747:0xa76240);box(g,436,316,90,136,home?0x9baf78:0xc49c65);
  for(let y=320;y<446;y+=12){box(g,442,y,78,2,0x906b48);for(let x=446;x<518;x+=14)box(g,x,y+4,4,4,0x8a7950);}
  box(g,160,100,640,52,0x59442f);box(g,170,106,620,42,0xe0c69b);
  for(let x=176;x<790;x+=32)box(g,x,110,2,30,0xd4b788);
  for(const x of [160,390,564,790]){box(g,x,98,10,60,0x614631);box(g,x+2,100,3,54,0xad7e46);}
  box(g,160,98,640,8,0x90663d);box(g,160,148,640,10,0x785334);box(g,160,148,640,2,0xc1985f);
  for(const x of [291,490,602]){
    box(g,x,112,64,33,0x5a4430);box(g,x+4,115,56,26,0x719794);box(g,x+6,117,24,10,0xa9cac0);box(g,x+34,117,22,10,0xa9cac0);
    box(g,x+30,114,4,28,0x7b5837);box(g,x+3,128,58,3,0x7b5837);box(g,x-3,142,70,5,0xb18953);
  }
  for(const x of [158,794]){box(g,x,154,10,376,0x614832);box(g,x+2,154,4,374,0xa27a49);}
  box(g,160,518,280,12,0x765338);box(g,520,518,280,12,0x765338);box(g,160,518,280,3,0xbd985f);box(g,520,518,280,3,0xbd985f);
  box(g,440,502,80,24,0xd4b789);box(g,444,506,72,12,0x806848);
  for(let x=448;x<516;x+=8)box(g,x,507,2,9,0xa39064);
  for(const f of home?HOME_FURNITURE:CAFE_FURNITURE){
    const shadow=new Graphics();shadow.ellipse(f.x+4,f.y+2,f.width*.47,8).fill({color:0x3b3227,alpha:.23});ground.addChild(shadow);
    const s=new Sprite(art.furniture[f.kind]);s.anchor.set(.5,1);s.position.set(f.x,f.y);s.width=f.width;s.height=Math.round(f.width*s.texture.height/s.texture.width/2)*2;s.zIndex=f.y;objects.addChild(s);
  }
  return {ground,objects};
}
