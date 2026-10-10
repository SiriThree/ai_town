// Whole-town composition. Presentation only; saved geometry/portals stay in town-map.
import {TOWN_BUILDINGS,TOWN_ROADS,TOWN_PLAZAS,TOWN_LAWNS,BRIDGES,STONE_APPROACH,mapContains,type MapBox} from "./town-map";
export type XY={x:number;y:number};
export const LANDMARKS=[
  {id:"old-town",name:"老街广场",polygon:[[65,110],[335,88],[620,120],[943,122],[976,245],[950,458],[907,598],[700,616],[375,621],[75,558]],tone:0},
  {id:"market",name:"榴木商业街",polygon:[[1020,135],[1214,118],[1355,195],[1390,304],[1368,465],[1255,515],[1090,510],[976,464]],tone:1},
  {id:"civic",name:"公共服务台地",polygon:[[240,602],[517,575],[854,592],[963,675],[1120,614],[1360,665],[1433,814],[1400,968],[1170,986],[863,958],[557,988],[267,956],[202,825]],tone:2},
  {id:"bridge-garden",name:"青篱桥头庭院",polygon:[[1390,280],[1644,306],[1785,426],[1770,525],[1660,668],[1450,689],[1356,612],[1345,473]],tone:0},
  {id:"north-homes",name:"东岸北里",polygon:[[1980,124],[2170,104],[2310,215],[2653,292],[2690,472],[2621,669],[2350,684],[2198,659],[1970,517]],tone:0},
  {id:"south-homes",name:"东岸南里",polygon:[[1980,742],[2184,723],[2321,905],[2554,960],[2650,1095],[2650,1368],[2420,1398],[2316,1240],[1980,1053]],tone:1},
  {id:"work-yard",name:"河畔工坊",polygon:[[1530,742],[1753,777],[1790,886],[1760,1094],[1560,1098],[1490,955]],tone:1},
] as const;
export function inPolygon(x:number,y:number,points:readonly (readonly number[])[]){let inside=false;for(let i=0,j=points.length-1;i<points.length;j=i++){const a=points[i],b=points[j];if((a[1]>y)!==(b[1]>y)&&x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0])inside=!inside;}return inside;}
// Region IDs are data, not canvas colours. Readback/antialiasing must never
// decide an array index; sample pixel centres directly from authored geometry.
export function districtMask(width:number,height:number,pixelSize:number){
  const mask=new Uint8Array(width*height);
  LANDMARKS.forEach((landmark,index)=>{
    const xs=landmark.polygon.map(p=>p[0]),ys=landmark.polygon.map(p=>p[1]);
    const left=Math.max(0,Math.floor(Math.min(...xs)/pixelSize));
    const right=Math.min(width-1,Math.ceil(Math.max(...xs)/pixelSize));
    const top=Math.max(0,Math.floor(Math.min(...ys)/pixelSize));
    const bottom=Math.min(height-1,Math.ceil(Math.max(...ys)/pixelSize));
    for(let y=top;y<=bottom;y++)for(let x=left;x<=right;x++){
      if(inPolygon((x+.5)*pixelSize,(y+.5)*pixelSize,landmark.polygon))mask[y*width+x]=index+1;
    }
  });
  return mask;
}
// Insets may extend over already-blocked land, NEVER over a saved walkable tile.
export const floorAt=(x:number,y:number)=>[...TOWN_ROADS,...TOWN_PLAZAS,...TOWN_LAWNS].some(b=>mapContains(b,x,y));
export function protectedFloor(x:number,y:number,margin=22){return [...TOWN_ROADS,...TOWN_PLAZAS,...TOWN_LAWNS].some(b=>x>=b.x-margin&&x<=b.x+b.w+margin&&y>=b.y-margin&&y<=b.y+b.h+margin);}
export function riverBanks(y:number){
  const pinch=Math.min(1,...BRIDGES.map(b=>Math.abs(y-(b.y+b.h/2))/110));
  return {left:1830-pinch*(43+24*Math.sin(y/143)+18*Math.sin(y/63)),right:1920+pinch*(50+28*Math.sin(y/192+.8)+14*Math.sin(y/57))};
}
export function landscapeWater(x:number,y:number){const b=riverBanks(y);return x>=b.left&&x<=b.right&&!BRIDGES.some(p=>mapContains(p,x,y))&&!floorAt(x,y);}
export const FOREST_GROVES=[
  {x:84,y:783,rx:154,ry:544},{x:430,y:1055,rx:300,ry:70},
  {x:455,y:1450,rx:460,ry:184},{x:1020,y:1495,rx:374,ry:152},{x:1500,y:1400,rx:257,ry:176},
  {x:2320,y:1510,rx:411,ry:179},{x:2768,y:952,rx:93,ry:655},
  {x:2240,y:108,rx:522,ry:153},{x:1540,y:64,rx:278,ry:180},
  {x:2274,y:815,rx:262,ry:145},{x:1625,y:706,rx:182,ry:83},
  {x:722,y:584,rx:181,ry:80},{x:2270,y:350,rx:111,ry:120},
];
const random=(n:number)=>{let v=Math.imul(n+721,374761393);v=Math.imul(v^(v>>>13),1274126177);return ((v^(v>>>16))>>>0)/4294967296;};
const outsideHouse=(x:number,y:number)=>TOWN_BUILDINGS.every(b=>Math.abs(x-b.x)>b.height*.62+26||y<b.y-b.height-22||y>b.y+72);
// Authored grove envelopes + deterministic Poisson-like spacing, not rows or fake actors.
export const LANDSCAPE_TREES:number[][]=[];
for(let i=0;i<2200;i++){
  const grove=FOREST_GROVES[i%FOREST_GROVES.length],theta=random(i*7)*Math.PI*2,r=Math.sqrt(random(i*7+1));
  const x=Math.round((grove.x+Math.cos(theta)*r*grove.rx)/2)*2,y=Math.round((grove.y+Math.sin(theta)*r*grove.ry)/2)*2;
  const h=84+Math.floor(random(i*7+2)*68);
  // Keep the narrow new approach readable: a foreground crown must not hide it
  // merely because its trunk sits just outside the walkable strip.
  if(STONE_APPROACH.some(b=>x+h*.55>b.x&&x-h*.55<b.x+b.w&&y>b.y&&y-h<b.y+b.h))continue;
  if(x<16||x>2788||y<30||y>1590||protectedFloor(x,y,38)||!outsideHouse(x,y)||x>riverBanks(y).left-42&&x<riverBanks(y).right+42)continue;
  if(x>270&&x<1450&&y>945&&y<1110)continue;
  if(LANDSCAPE_TREES.some(t=>Math.hypot(t[0]-x,(t[1]-y)*1.25)<64))continue;
  LANDSCAPE_TREES.push([x,y,h,random(i*7+3)>.93?1:0]);
}
// Shared yards enclose two homes, rather than four disconnected specimen plots.
const YARD_BOUNDARIES=[
  {x:1958,y:175,length:292,vertical:true},{x:1958,y:136,length:278,vertical:false},
  {x:2250,y:266,length:365,vertical:false},{x:2632,y:295,length:210,vertical:true},
  {x:1964,y:794,length:265,vertical:true},{x:1980,y:740,length:254,vertical:false},
  {x:2240,y:1008,length:206,vertical:true},{x:2316,y:1000,length:304,vertical:false},
  {x:2630,y:1020,length:212,vertical:true},
  {x:272,y:566,length:690,vertical:false},{x:270,y:625,length:148,vertical:true},
];
// Split at existing road crossings rather than drawing an impassable fence across a lane.
export const YARD_FENCES=YARD_BOUNDARIES.flatMap(f=>{
  const result:typeof YARD_BOUNDARIES=[];let start=-1;
  for(let d=0;d<=f.length+2;d+=2){const x=f.x+(f.vertical?0:d),y=f.y+(f.vertical?d:0),bank=riverBanks(y);const blocked=d>f.length||protectedFloor(x,y,10)||(x>=bank.left-10&&x<=bank.right+10);
    if(!blocked&&start<0)start=d;
    if(blocked&&start>=0){if(d-start>=18)result.push({...f,x:f.x+(f.vertical?0:start),y:f.y+(f.vertical?start:0),length:d-start-2});start=-1;}
  }return result;
});
export const DISTRICT_PROPS=[
  {kind:"crate" as const,x:1340,y:361},{kind:"barrel" as const,x:1352,y:397},
  {kind:"planter" as const,x:2290,y:524},{kind:"barrel" as const,x:2186,y:364},
  {kind:"planter" as const,x:2044,y:973},{kind:"barrel" as const,x:2205,y:975},
  {kind:"crate" as const,x:1763,y:1004},{kind:"barrel" as const,x:1554,y:994},
  {kind:"planter" as const,x:2450,y:1250},{kind:"planter" as const,x:2620,y:1260},
].filter(p=>!protectedFloor(p.x,p.y,20));
export const decorationClear=(x:number,y:number,w:number)=>[-w/2,0,w/2].every(dx=>!protectedFloor(x+dx,y,8));
export const DISTRICT_BEDS=[[2020,438,42],[2160,446,62],[2310,520,83],[2580,542,58],[1990,1028,52],[2190,1036,59],[2330,1250,85],[2430,1236,38],[440,953,122],[742,946,102],[1240,948,126],[1450,1020,73]];
export const DISTRICT_LAMPS=[[340,940],[690,945],[1160,945],[1432,875],[1776,654],[1964,648],[1776,1100],[1964,1094],[2032,468],[2310,506],[2210,1090]];
export const DISTRICT_BENCHES=[[512,954],[836,948],[1280,942],[2004,668],[2032,1100],[2360,536]];
export const isOldBorderTree=(x:number,y:number)=>y>=1450||x>=2770;
export const MAIN_STREETS:MapBox[]=[{x:80,y:332,w:1160,h:78},{x:990,y:332,w:80,h:660},{x:990,y:542,w:1760,h:80}];
