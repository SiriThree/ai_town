import {DISTRICT_PROPS,riverBanks,protectedFloor} from "../lib/town-landscape";
import {Container,Graphics} from "pixi.js";
import {GARDEN_EDGES,STREET_PROPS,type StreetProp} from "../lib/town-dressing";
const box=(g:Graphics,x:number,y:number,w:number,h:number,c:number)=>g.rect(x,y,w,h).fill(c);

// Original small pixel props. Two world units per base pixel, upper-left daylight.
// Their feet sit on existing non-walkable land; these do not create new interaction areas.
function prop(p:StreetProp){
  const g=new Graphics();g.position.set(Math.round(p.x/2)*2,Math.round(p.y/2)*2);g.zIndex=p.y;
  g.ellipse(5,1,18,5).fill({color:0x263b29,alpha:.25});
  if(p.kind==="barrel"){
    box(g,-12,-30,24,28,0x67462e);box(g,-14,-26,28,20,0x986137);
    for(let i=-10;i<=10;i+=6){box(g,i,-25,2,21,0xbe8e50);box(g,i+2,-25,2,21,0x795132);}
    box(g,-12,-25,24,4,0x575e4f);box(g,-12,-9,24,4,0x575e4f);box(g,-10,-30,20,4,0xc7a06a);box(g,-8,-28,16,2,0x65482f);
    box(g,-10,-24,4,2,0x9ea18a);box(g,-10,-8,4,2,0x9ea18a);
  }else if(p.kind==="crate"){
    box(g,-16,-26,32,24,0x674a30);box(g,-14,-24,28,20,0x9b713f);
    for(let y=-22;y<-3;y+=6){box(g,-12,y,24,2,0xc7a16a);box(g,-12,y+2,24,2,0x785b34);}
    box(g,-16,-26,4,24,0xb79256);box(g,12,-26,4,24,0x795730);box(g,-16,-26,32,4,0xd0ac70);
    for(let i=0;i<4;i++){box(g,-10+i*6,-29+i%2*2,6,5,i%2?0x768941:0xa97d3b);box(g,-8+i*6,-30+i%2*2,2,2,0xc3be68);}
  }else if(p.kind==="sign"){
    box(g,-12,-8,4,10,0x60432d);box(g,10,-8,4,10,0x60432d);box(g,-16,-42,32,36,0x725136);box(g,-14,-40,28,32,0xcba469);box(g,-10,-36,20,24,0x344938);
    box(g,-6,-30,8,8,0xeadbb6);box(g,2,-28,4,4,0xeadbb6);box(g,-8,-18,16,2,0xc9bb85);box(g,-6,-14,12,2,0x7f976d);
  }else{
    box(g,-15,-14,30,14,0x77543a);box(g,-17,-17,34,5,0xb3834c);box(g,-13,-9,26,2,0xce9d60);
    for(const [x,y] of [[-10,-23],[0,-28],[9,-22],[-4,-20]]){box(g,x-6,y-5,12,10,0x526e37);box(g,x-4,y-7,8,4,0x779447);box(g,x,y-6,2,2,0xe2cd78);}
  }
  return g;
}
export function addStreetDetails(objects:Container){
  // Hand-authored rocky northern banks. Uneven shelves, moss and reeds break the canal edge.
  // All stones are outside the existing water-crossing corridor y542..622.
  const riverRocks=Array.from({length:28},(_,i)=>{const y=35+i*55+Math.round(Math.sin(i*2.3)*19),b=riverBanks(y);return [i%2?b.right+6:b.left-5,y,14+(i*7)%16];}).filter(([x,y,w])=>!protectedFloor(x,y,w+4));
  for(const [x,y,wide]of riverRocks){
    const g=new Graphics();g.zIndex=y;g.position.set(Math.round(x/2)*2,Math.round(y/2)*2);
    g.poly([-wide,0,-wide+6,-16,-12,-22,6,-18,wide-2,-10,wide,4,12,10,-13,8]).fill(0x58604b);
    g.poly([-wide+2,-6,-wide+8,-20,-10,-27,8,-23,wide,-13,wide-2,-5,10,2,-9,0]).fill(0x8a8c70);
    g.poly([-wide+8,-20,-10,-27,8,-23,wide,-13,9,-14,-7,-17]).fill(0xb6b191);
    for(let i=0;i<34;i++){const dx=((i*17+wide*3)%(wide+12))-wide/2-4,dy=-18+((i*7)%19);if(Math.abs(dx)/wide+Math.abs(dy+8)/24<.9)box(g,Math.round(dx/2)*2,Math.round(dy/2)*2,2,2,[0x9c9c7c,0x72785c,0xc1ba98,0x81876c][i%4]);}
    box(g,-9,-16,3,15,0x64694f);box(g,10,-12,2,16,0x666952);box(g,-wide+7,-8,10,3,0x718846);
    box(g,-wide+2,-19,7,3,0x809745);box(g,-wide+5,-23,4,4,0xa0b05a);
    for(const [dx,dy]of [[-8,-25],[0,-20],[7,-24]]){box(g,dx,dy-11,2,15,0x6b8742);box(g,dx-3,dy-6,3,2,0x89984d);box(g,dx,dy-14,3,5,0xa19a54);}
    objects.addChild(g);
  }
  for(const p of [...STREET_PROPS,...DISTRICT_PROPS])objects.addChild(prop(p));
  for(const [x,y,w]of GARDEN_EDGES){const g=new Graphics();g.zIndex=y;g.position.set(Math.round(x/2)*2,Math.round(y/2)*2);
    box(g,3,0,w,4,0x52623d);
    for(let i=0;i<w;i+=18){const width=Math.min(16,w-i);box(g,i,-12,width,12,0x80765b);box(g,i,-12,width,3,0xbdb08a);box(g,i+2,-8,width-4,3,0x9d9270);box(g,i+width-2,-9,2,8,0x655f4d);}
    objects.addChild(g);
  }
}
