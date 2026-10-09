import {LIVING_SLICE,GARDEN_PATCHES} from "../lib/town-dressing";
import {TOWN_SIZE,TOWN_ROADS,TOWN_PLAZAS,RIVER,BRIDGES,STEPS,mapContains} from "../lib/town-map";
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
    if(BRIDGES.some(b=>mapContains(b,x*ART_PIXEL,y*ART_PIXEL))) {
      color=y%5===0?[113,80,45]:[176+h%9,134+h%9,78+h%9];
    } else if(mapContains(RIVER,x*ART_PIXEL,y*ART_PIXEL)) {
      const bank=x*ART_PIXEL<RIVER.x+8||x*ART_PIXEL>RIVER.x+RIVER.w-8;
      color=bank?[112,143,103]:h%37===0?[155,198,191]:[77+h%10,140+h%10,153+h%10];
    } else if(STEPS.some(b=>mapContains(b,x*ART_PIXEL,y*ART_PIXEL))) {
      color=y%5===0?[115,112,94]:y%5===1?[216,206,174]:[172,164,137];
    } else if(plaza(x,y)) {
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
    const wx=x*ART_PIXEL,wy=y*ART_PIXEL;
    const margin=Math.min(wx-LIVING_SLICE.x,LIVING_SLICE.x+LIVING_SLICE.w-wx,wy-LIVING_SLICE.y,LIVING_SLICE.y+LIVING_SLICE.h-wy);
    if(margin>0){
      const mix=Math.min(1,margin/70),n=h%7-3;
      let painted=color;
      const isRoad=road(x,y),isPlaza=plaza(x,y),water=mapContains(RIVER,wx,wy),bridge=BRIDGES.some(b=>mapContains(b,wx,wy));
      if(bridge){
        const board=(x*2)%14,bolt=(x%7===1)&&(y%17===3);
        painted=board<2?[91,65,40]:board<4?[210,164,92]:[157+n,111+n,61+n];
        if(bolt)painted=[74,70,53];
      }else if(water){
        // Irregular rock/reed shore stays inside the impassable water band.
        const shore=8+Math.floor((Math.sin(wy/47)+Math.sin(wy/19))*3),edge=Math.min(wx-RIVER.x,RIVER.x+RIVER.w-wx);
        const ripple=hash(Math.floor(x/8),Math.floor(y/3));
        painted=edge<shore?[95+n,102+n,76+n]:edge<shore+5?[72,155,153]:[39+n,119+n,155+n];
        if(edge>shore+4&&ripple%13===0&&y%3===0&&x%8<6)painted=[107,189,196];
        if(edge<shore&&y%7===0)painted=[156,158,113];
      }else if(isPlaza){
        const row=Math.floor(y/6),col=(x+(row%2)*6)%12,iy=y%6,v=hash(Math.floor((x+(row%2)*6)/12),row)%17;
        painted=col===11||iy===5?[119,120,100]:[168+v,163+v,137+v];
        if(iy===0&&col<10)painted=[202+v,193+v,160+v];
        if(h%71===0)painted=[116,135,84];
      }else if(isRoad){
        // Shop aprons use the SAME existing road polygon; no extra apparent shortcuts.
        const apron=(wx>=666&&wx<=876&&wy<402)||(wx>=1082&&wx<=1234&&wy<416);
        if(apron){const row=Math.floor(y/5),joint=y%5===4||(x+(row%2)*5)%10===9;const v=hash(Math.floor(x/10),row)%14;painted=joint?[119,105,78]:[183+v,164+v,123+v];}
        else{painted=[211+n+patch*2,176+n+patch*2,109+n+patch*2];
          const edge=!road(x-3,y)||!road(x+3,y)||!road(x,y-3)||!road(x,y+3);
          if(edge)painted=h%4===0?[128,149,68]:[176+n,151+n,86+n];
          if(h%31===0)painted=[236,205,145];if(h%43===0)painted=[186,152,96];
        }
      }else{
        const clump=Math.sin(wx/51+Math.sin(wy/39))*Math.cos(wy/43)+Math.sin((wx+wy)/93)*.6;
        const garden=GARDEN_PATCHES.some(p=>((wx-p.x)/p.rx)**2+((wy-p.y)/p.ry)**2<1+.08*Math.sin(wx/11));
        painted=garden?[88+n+clump*6,125+n+clump*8,56+n]:[116+n+clump*9,149+n+clump*10,67+n+clump*4];
        const tuft=hash(Math.floor(x/7),Math.floor(y/7)),tx=(tuft>>>5)%5+1,ty=(tuft>>>9)%4+1;
        if(tuft%3===0&&((x%7===tx&&y%7>=ty&&y%7<=ty+2)||(x%7===tx+1&&y%7===ty+1)))painted=garden?[138,159,64]:[147,166,80];
        if(tuft%7===0&&x%7===tx&&y%7===ty+2)painted=[75,108,49];
        // Small clustered meadow flowers, not evenly spaced decorative icons.
        if(garden&&tuft%5===0&&x%7===tx&&y%7===ty)painted=tuft%2?[220,205,110]:[202,196,167];
        const edge=road(x-2,y)||road(x+2,y)||road(x,y-2)||road(x,y+2);
        if(edge)painted=h%3?[86,119,51]:[144,153,76];
        const bankDistance=Math.min(Math.abs(wx-RIVER.x),Math.abs(wx-RIVER.x-RIVER.w));
        if(bankDistance<14+Math.sin(wy/23)*4)painted=h%6===0?[172,164,119]:[89+n,110+n,66+n];
      }
      color=color.map((c,i)=>Math.round(c+(painted[i]-c)*mix));
    }
    const offset=(y*width+x)*4;data.data.set([...color,255],offset);
  }
  context.putImageData(data,0,0);const texture=Texture.from(canvas);texture.source.scaleMode="nearest";
  groundTexture=texture;return groundSprite(texture);
}
