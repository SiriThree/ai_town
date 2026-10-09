import {Texture,Sprite} from "pixi.js";
import {ART_PIXEL} from "../lib/scene-motion";
import {TOWN_SIZE,TOWN_ROADS,TOWN_PLAZAS,TOWN_LAWNS,BRIDGES,STEPS,mapContains} from "../lib/town-map";
import {LANDMARKS,FOREST_GROVES,MAIN_STREETS,riverBanks} from "../lib/town-landscape";
let groundTexture:Texture|undefined;
const hash=(x:number,y:number)=>{let n=Math.imul(x+391,374761393)^Math.imul(y+971,668265263);n=Math.imul(n^(n>>>13),1274126177);return (n^(n>>>16))>>>0;};
const groundSprite=(t:Texture)=>{const s=new Sprite(t);s.scale.set(ART_PIXEL);return s;};
// Cached original pixel terrain; houses, plants, characters remain independent depth-sorted objects.
export function drawGround(){
  if(groundTexture&&!groundTexture.destroyed)return groundSprite(groundTexture);
  const canvas=document.createElement("canvas");canvas.width=TOWN_SIZE.width/2;canvas.height=TOWN_SIZE.height/2;
  const width=canvas.width,height=canvas.height,ctx=canvas.getContext("2d")!,data=ctx.createImageData(width,height);
  const masks=new Uint8Array(width*height),district=new Uint8Array(width*height);
  // Rasterize the physical floor once; all visible paving is clipped to the same geometry.
  for(const [list,value]of [[TOWN_ROADS,1],[TOWN_LAWNS,3],[TOWN_PLAZAS,2]] as const)for(const b of list){
    for(let y=Math.max(0,Math.ceil(b.y/2));y<=Math.min(height-1,Math.floor((b.y+b.h)/2));y++)for(let x=Math.max(0,Math.ceil(b.x/2));x<=Math.min(width-1,Math.floor((b.x+b.w)/2));x++)masks[y*width+x]=value;
  }
  ctx.imageSmoothingEnabled=false;
  LANDMARKS.forEach((l,i)=>{ctx.beginPath();l.polygon.forEach(([x,y],k)=>k?ctx.lineTo(x/2,y/2):ctx.moveTo(x/2,y/2));ctx.closePath();ctx.fillStyle=`rgb(${i+1},0,0)`;ctx.fill();});
  const encoded=ctx.getImageData(0,0,width,height).data;for(let i=0;i<district.length;i++)district[i]=encoded[i*4];
  const floor=(x:number,y:number)=>x>=0&&x<width&&y>=0&&y<height?masks[y*width+x]:0;
  for(let y=0;y<height;y++){
    const wy=y*2,banks=riverBanks(wy);
    for(let x=0;x<width;x++){
      const wx=x*2,h=hash(x,y),n=h%7-3,idx=y*width+x,d=district[idx];
      const patch=Math.sin(wx/91+Math.sin(wy/74))*Math.cos(wy/83)*6+Math.sin((wx+wy)/137)*3;
      const grove=FOREST_GROVES.some(g=>((wx-g.x)/g.rx)**2+((wy-g.y)/g.ry)**2<1+.08*Math.sin(wx/19));
      let c=grove?[72+n+patch,110+n+patch,49+n]:[111+n+patch,144+n+patch,70+n];
      if(d){const tone=LANDMARKS[d-1].tone;c=tone===2?[125+n+patch,151+n+patch,82+n]:tone===1?[134+n+patch,154+n+patch,82+n]:[120+n+patch,154+n+patch,73+n];}
      // Organic undergrowth islands give unbuilt land a role rather than filling with lawn noise.
      const tuft=hash(Math.floor(x/6),Math.floor(y/6)),tx=(tuft>>>5)%4+1,ty=(tuft>>>9)%3+1;
      if(tuft%3===0&&x%6===tx&&y%6>=ty&&y%6<ty+2)c=grove?[118,151,64]:[145,165,83];
      if(tuft%7===0&&x%6===tx+1&&y%6===ty+1)c=[69,103,43];
      if((grove||d)&&tuft%19===0&&x%6===tx&&y%6===ty)c=tuft%2?[224,198,105]:[204,207,167];
      const bridge=BRIDGES.some(b=>mapContains(b,wx,wy));
      if(bridge){const board=x%7;c=board===0?[88,65,43]:board===1?[211,171,103]:[154+n,114+n,64+n];if(x%7===2&&y%17===3)c=[61,65,50];}
      else if(wx>=banks.left&&wx<=banks.right&&!floor(x,y)){
        const edge=Math.min(wx-banks.left,banks.right-wx),flow=hash(Math.floor(x/10),Math.floor(y/3));
        c=edge<6?[77,104,69]:edge<12?[147+n,149+n,108+n]:edge<22?[65,149,147]:[34+n,109+n,148+n];
        if(edge>22&&flow%9===0&&y%3===0&&x%10<7)c=[106,182,188];
        if(edge<10&&h%5===0)c=[194,186,139];
      }else if(floor(x,y)){
        const civic=wy>=822&&wy<=922&&wx>=330&&wx<=1370;
        const shop=(wx>=664&&wx<=874&&wy<402)||(wx>=1080&&wx<=1230&&wy<427);
        const bridgehead=BRIDGES.some(b=>Math.abs(wy-b.y-b.h/2)<40&&(Math.abs(wx-b.x)<65||Math.abs(wx-b.x-b.w)<65));
        const stepping=STEPS.some(b=>mapContains(b,wx,wy))||(wx>=990&&wx<=1070&&wy>=949&&wy<1035);
        if(stepping){c=y%5===0?[97,94,77]:y%5===1?[219,201,157]:[167+n,157+n,126+n];}
        else if(floor(x,y)===2||shop||bridgehead){
          const row=Math.floor(y/6),col=(x+(row%2)*7)%14,v=hash(Math.floor((x+(row%2)*7)/14),row)%17;
          c=y%6===5||col===13?[117,115,94]:civic?[165+v,164+v,141+v]:shop?[180+v,157+v,111+v]:[181+v,174+v,143+v];
          if(y%6===0&&col<12)c=c.map(a=>a+17);
          if(h%97===0)c=[131,145,93];
        }else if(floor(x,y)===3){c=[139+n,157+n,86+n];}
        else{
          const main=MAIN_STREETS.some(b=>mapContains(b,wx,wy));
          const edge=(!floor(x-5,y)||!floor(x+5,y)||!floor(x,y-5)||!floor(x,y+5));
          c=main?[218+n,182+n,116+n]:[189+n,169+n,116+n];
          // Narrow worn spine + traversable gravel/verge, retaining the entire legal shoulder.
          const r=TOWN_ROADS.find(b=>mapContains(b,wx,wy))!;
          const across=r.w>r.h?Math.abs(wy-r.y-r.h/2):Math.abs(wx-r.x-r.w/2);
          if(!main&&across>22)c=h%5?[160+n,161+n,104+n]:[200,183,132];
          if(edge)c=h%3?[150+n,148+n,88+n]:[190,165,103];
          if(h%41===0)c=[233,208,151];if(h%53===0)c=[152,135,88];
        }
      }else{
        // Front face of terrace, below an authored top contour. No wall across a walkable lane.
        let ledge=0;for(let up=1;up<=31;up++){if(y-up>=0&&district[(y-up)*width+x]&&!d){ledge=up;break;}}
        if(ledge){const row=Math.floor((ledge-1)/6),col=(x+row%2*5)%13,v=hash(Math.floor(x/13),row)%19;
          c=ledge<=2?[202+n,187+n,139+n]:col===0||ledge%6===0?[85+v,83+v,63+v]:[122+v,119+v,88+v];
          if(col===1)c=[167+v,158+v,117+v];if(col===11&&ledge%6>2)c=[78+v,82+v,58+v];if(h%17===0)c=c.map(a=>a+13);if(ledge>27&&h%3)c=[73+n,98+n,48+n];
        }else if(d&&(!district[idx+width]||!district[idx+2*width]))c=[169+n,178+n,104+n];
        const bankDistance=Math.min(Math.abs(wx-banks.left),Math.abs(wx-banks.right));
        if(bankDistance<22)c=h%9===0?[168,164,117]:[73+n,106+n,54+n];
      }
      data.data.set([...c.map(a=>Math.round(a)),255],idx*4);
    }
  }
  ctx.putImageData(data,0,0);groundTexture=Texture.from(canvas);groundTexture.source.scaleMode="nearest";return groundSprite(groundTexture);
}
