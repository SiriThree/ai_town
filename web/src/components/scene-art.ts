import {SLICE_TREES,SLICE_FLOWERS,COURTYARD_FENCES} from "../lib/town-dressing";
import {addStreetDetails} from "./street-details";
import {TOWN_BUILDINGS,TOWN_FENCES,TOWN_FLOWERS,TOWN_TREES,TOWN_BENCHES,TOWN_LAMPS,BRIDGES} from "../lib/town-map";
import newFrames from "./new-resident-frames.json";
import districtFrames from "./district-frames.json";
import { Assets, Container, Graphics, Rectangle, Sprite, Texture } from "pixi.js";
import type { Npc } from "../lib/world";
import { RESIDENT_HEIGHT, snapPixel, type Pose } from "../lib/scene-motion";
import frames from "./resident-frames.json";
import { drawGround } from "./scene-ground";

// Original atlases; provenance: public/art/v4-1/ASSETS.md and v4-2/ASSETS.md.
export async function loadSceneArt() {
  const [town, aqing, aning, props, district, expansion, residents] = await Promise.all([Assets.load<Texture>("/art/v4-1/town-atlas.png"), Assets.load<Texture>("/art/v4-2/aqing-walk.png"), Assets.load<Texture>("/art/v4-2/aning-walk.png"), Assets.load<Texture>("/art/v4-1/props-atlas.png"),Assets.load<Texture>("/art/v8-1/east-buildings.png"),Assets.load<Texture>("/art/v8-2/buildings.png"),Assets.load<Texture>("/art/v9-1/residents.png")]);
  town.source.scaleMode = aqing.source.scaleMode = aning.source.scaleMode = props.source.scaleMode = district.source.scaleMode = expansion.source.scaleMode = residents.source.scaleMode = "nearest";
  const crop=(t:Texture,x:number,y:number,w:number,h:number)=>new Texture({source:t.source,frame:new Rectangle(x,y,w,h)});
  const residentFrames=(t:Texture,layout:typeof frames.aqing)=>Object.fromEntries(Object.entries(layout).map(([direction,cells])=>[direction,cells.map(([x,y,w,h])=>crop(t,x,y,w,h))])) as Record<Pose["facing"],Texture[]>;
  return {hall:crop(expansion,8,30,428,392),clinic:crop(expansion,470,82,391,337),library:crop(expansion,912,29,402,393),workshop:crop(expansion,1338,42,423,380),rose:crop(expansion,17,490,407,365),sage:crop(expansion,445,508,440,342),reed:crop(expansion,893,512,436,347),stone:crop(expansion,1342,432,416,424),store:crop(district,...districtFrames.store as [number,number,number,number]),cottage:crop(district,...districtFrames.cottage as [number,number,number,number]),home:crop(town,45,39,548,545),cafe:crop(town,661,39,569,545),oak:crop(town,31,626,569,590),blossom:crop(town,650,643,573,573),
    fountain:crop(props,149,31,540,417),bench:crop(props,868,83,484,338),lamp:crop(props,354,450,118,539),bed:crop(props,771,597,656,314),
    residents:{aqing:residentFrames(aqing,frames.aqing),aning:residentFrames(aning,frames.aning),...Object.fromEntries(Object.entries(newFrames).map(([id,layout])=>[id,residentFrames(residents,layout)]))} as Record<string,Record<Pose["facing"],Texture[]>>};
}
type Art=Awaited<ReturnType<typeof loadSceneArt>>;
const rect=(g:Graphics,x:number,y:number,w:number,h:number,c:number)=>g.rect(x,y,w,h).fill(c);
const poly=(g:Graphics,p:number[],c:number)=>g.poly(p).fill(c);
function sprite(t:Texture,x:number,y:number,h:number) {
  const s=new Sprite(t);s.anchor.set(.5,1);s.position.set(snapPixel(x),snapPixel(y));s.height=Math.round(h/2)*2;s.width=Math.round(s.height*t.width/t.height/2)*2;s.zIndex=y;return s;
}
function fence(g:Graphics,x:number,y:number,w:number) {
  rect(g,x+4,y+22,w,6,0x7a8d57);rect(g,x,y+6,w,4,0x765636);rect(g,x,y+6,w,2,0xc19a60);rect(g,x,y+16,w,4,0x967143);
  for(let i=0;i<w;i+=15){rect(g,x+i,y,5,27,0x795938);rect(g,x+i,y,3,23,0xd0b67b);rect(g,x+i-1,y-2,7,3,0xb99458);rect(g,x+i,y-2,5,1,0xe6cd91);rect(g,x+i+2,y+8,1,1,0x57462f);rect(g,x+i+2,y+17,1,1,0x57462f);}
}
export function drawTown(art:Art):{ground:Container;objects:Container} {
  const ground=new Container(),objects=new Container();objects.sortableChildren=true;
  ground.addChild(drawGround());
  const g=new Graphics();ground.addChild(g);
  // Upper-left daylight casts all contact shadows towards lower-right.
  for(const {x,y:foot}of TOWN_BUILDINGS) {
    const y=foot-7,w=200;poly(g,[x-w/2,y-24,x+w/2,y-24,x+w/2+18,y+12,x-w/2+14,y+12],0x758459);
  }
  for(const b of BRIDGES){fence(g,b.x,b.y-17,b.w);fence(g,b.x,b.y+b.h-4,b.w);}
  const bridge=BRIDGES[0];
  for(const x of [bridge.x-10,bridge.x+bridge.w-12])for(const y of [bridge.y-19,bridge.y+bridge.h+4]){
    rect(g,x+3,y+2,25,6,0x526b50);
    for(let row=0;row<3;row++)for(let col=0;col<2;col++){const px=x+col*12+(row%2)*2,py=y-14+row*5;rect(g,px,py,11,5,0x807963);rect(g,px,py,11,1,0xc7bc95);}
  }
  for(const [x,y,w]of TOWN_FENCES)fence(g,x,y,w);
  for(const f of COURTYARD_FENCES){
    if(!f.vertical){fence(g,f.x,f.y-25,f.length);continue;}
    rect(g,f.x,f.y-18,4,f.length+18,0x705334);rect(g,f.x,f.y-18,2,f.length+18,0xaf8b50);
    for(let d=0;d<=f.length;d+=18){rect(g,f.x-2,f.y+d-25,6,25,0x745532);rect(g,f.x-2,f.y+d-25,3,23,0xc6a775);rect(g,f.x-3,f.y+d-27,8,3,0xd8b983);}
  }
  for(const [x,y,w]of [...TOWN_FLOWERS,...SLICE_FLOWERS])objects.addChild(sprite(art.bed,x+w/2,y+15,w*314/656));
  for(let i=0;i<7;i++){rect(g,379+i*31,284+i%2*2,20,7,0xc7bc98);rect(g,380+i*31,284+i%2*2,17,2,0xe0d1a6);}
  const fountain=sprite(art.fountain,479,462,67);objects.addChild(fountain);
  for(const [x,y]of TOWN_BENCHES)objects.addChild(sprite(art.bench,x,y,38));
  for(const [x,y]of TOWN_LAMPS)objects.addChild(sprite(art.lamp,x,y,63));
  for(const b of TOWN_BUILDINGS){const house=sprite(art[b.texture],b.x,b.y,b.height);house.zIndex=b.y-8;objects.addChild(house);}
  for(const [x,y,h,pink]of [...TOWN_TREES,...SLICE_TREES]){
    const shadow=new Graphics();shadow.ellipse(x+6,y+3,h*.23,h*.075).fill({color:0x405c3b,alpha:.17});ground.addChild(shadow);objects.addChild(sprite(pink?art.blossom:art.oak,x,y,h));
  }
  const table=new Graphics();table.zIndex=292;rect(table,857,280,4,15,0x79613f);table.ellipse(859,277,14,6).fill(0x8b6744);table.ellipse(859,275,14,5).fill(0xd4b47b);rect(table,852,269,5,5,0xf6e7c7);rect(table,858,270,2,3,0xf6e7c7);objects.addChild(table);
  addStreetDetails(objects);
  return {ground,objects};
}
export type ResidentArt={node:Container;update:(pose:Pose,selected:boolean)=>boolean};
export function drawResident(n:Npc,selected:boolean,art:Art):ResidentArt {
  const node=new Container(),shadow=new Graphics(),ring=new Graphics(),marker=new Graphics();
  shadow.ellipse(3,1,14,5).fill({color:0x374835,alpha:.28});ring.ellipse(0,0,20,8).stroke({color:0xffedac,width:2});
  const appearance=n.appearance??n.id,resident=art.residents[appearance]??art.residents.aqing;
  const figure=sprite(resident.south[0],0,0,RESIDENT_HEIGHT);poly(marker,[-4,-74,4,-74,0,-70],0xffedac);node.addChild(shadow,ring,figure,marker);
  let previous="";
  const update=(pose:Pose,isSelected:boolean)=>{
    const signature=`${pose.position.x}:${pose.position.y}:${pose.facing}:${pose.frame}:${pose.moving}:${isSelected}`;
    if(signature===previous)return false;previous=signature;
    node.position.set(pose.position.x,pose.position.y);node.zIndex=pose.position.y;
    figure.texture=resident[pose.facing][pose.frame];figure.scale.set(1);figure.height=RESIDENT_HEIGHT;figure.width=Math.round(RESIDENT_HEIGHT*figure.texture.width/figure.texture.height/2)*2;
    if(n.appearance&&pose.facing==="west")figure.scale.x=-Math.abs(figure.scale.x);
    ring.visible=marker.visible=isSelected;return true;
  };
  update({position:n.position,facing:"south",frame:0,moving:false},selected);return {node,update};
}
