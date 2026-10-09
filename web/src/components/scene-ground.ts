import {TOWN_SIZE,TOWN_ROADS,TOWN_PLAZAS,mapContains} from "../lib/town-map";
import { Texture, Sprite } from "pixi.js";
import { ART_PIXEL } from "../lib/scene-motion";

// Original procedural pixel terrain. One logical pixel = 2 world units throughout the scene.
// This texture is static art, never a second simulation or a source of resident positions.
let groundTexture:Texture|undefined;
function groundSprite(texture:Texture){const sprite=new Sprite(texture);sprite.scale.set(ART_PIXEL);return sprite;}
export function drawGround() {
  // Scene switches dispose objects, while this one shared static texture remains reusable.
  if(groundTexture&&!groundTexture.destroyed)return groundSprite(groundTexture);
  const canvas=document.createElement("canvas");canvas.width=TOWN_SIZE.width/ART_PIXEL;canvas.height=TOWN_SIZE.height/ART_PIXEL;
  const width=canvas.width,height=canvas.height;
  const context=canvas.getContext("2d")!;const data=context.createImageData(width,height);
  const hash=(x:number,y:number)=>{let n=Math.imul(x+391,374761393)^Math.imul(y+971,668265263);n=Math.imul(n^(n>>>13),1274126177);return (n^(n>>>16))>>>0;};
  const road=(x:number,y:number)=>TOWN_ROADS.some(b=>mapContains(b,x*ART_PIXEL,y*ART_PIXEL));
  const plaza=(x:number,y:number)=>TOWN_PLAZAS.some(b=>mapContains(b,x*ART_PIXEL,y*ART_PIXEL));
  for(let y=0;y<height;y++)for(let x=0;x<width;x++) {
    const h=hash(x,y),patch=hash(Math.floor(x/8),Math.floor(y/8))%5-2;
    let color:number[];
    if(plaza(x,y)) {
      const row=Math.floor((y-154)/7),col=(x-174+(row%2)*6)%13,iy=(y-154)%7;
      const wear=hash(Math.floor((x-174+(row%2)*6)/13),row)%13-6;
      color=iy===6||col===12?[158,155,130]:[191+wear,185+wear,156+wear];
      if(iy===0&&col<11)color=[211+wear,203+wear,172+wear];
      if(h%21===0)color=color.map(c=>c-12);
      if(h%31===0)color=[172,178,130];
      // Broken stone edging instead of a thick rectangular border.
      if((x===174||x===310||y===154||y===242)&&h%4)color=[148,151,113];
    } else if(road(x,y)) {
      const edge=(!road(x-2,y)||!road(x+2,y)||!road(x,y-2)||!road(x,y+2))&&!plaza(x,y);
      const noise=h%9-4;color=[211+noise+patch,190+noise+patch,145+noise+patch];
      if(h%29===0)color=[185,164,119];if(h%47===0)color=[234,216,173];
      if(edge&&h%3!==0)color=h%2?[159,167,105]:[180,178,124];
    } else {
      color=[139+patch,163+patch,94+patch];
      if(h%17===0)color=[134+patch,158+patch,90+patch];
      if(h%23===0)color=[145+patch,168+patch,100+patch];
      const edge=road(x-2,y)||road(x+2,y)||road(x,y-2)||road(x,y+2);
      if(edge&&h%3===0)color=[184,181,123];
      // Cohesive short tufts, not isolated bright confetti.
      if(hash(Math.floor(x/3),Math.floor(y/3))%19===0&&((x%3===1&&y%3>0)||(x%3===0&&y%3===1)))color=[121,147,81];
    }
    const offset=(y*width+x)*4;data.data.set([...color,255],offset);
  }
  context.putImageData(data,0,0);const texture=Texture.from(canvas);texture.source.scaleMode="nearest";
  groundTexture=texture;return groundSprite(texture);
}
