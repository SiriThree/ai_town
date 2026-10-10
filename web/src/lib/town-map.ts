// Pure map content: no PixiJS, DOM or database imports. Coordinates preserve the old street.
export type MapBox={x:number;y:number;w:number;h:number};
export const TOWN_SIZE={width:2800,height:1600};
export const RIVER={x:1830,y:0,w:90,h:1600};
export const BRIDGES:MapBox[]=[{x:1800,y:542,w:150,h:80},{x:1800,y:1122,w:150,h:80}];
export const STEPS:MapBox[]=[{x:990,y:766,w:80,h:48}];
// Additive V10.4 access: skirt Stone House's west wall, then join its south door.
// Existing doors, obstacles and saved NPC routes remain unchanged.
export const STONE_APPROACH:MapBox[]=[{x:2390,y:1160,w:40,h:142},{x:2390,y:1230,w:180,h:72}];
export const NEW_BUILDINGS=[
  {id:"hall",name:"晨光会馆",texture:"hall",x:410,y:807,height:242},
  {id:"clinic",name:"河风诊所",texture:"clinic",x:800,y:807,height:210},
  {id:"library",name:"青叶书屋",texture:"library",x:1210,y:807,height:230},
  {id:"workshop",name:"杉木工坊",texture:"workshop",x:1670,y:957,height:226},
  {id:"rose",name:"蔷薇居",texture:"rose",x:2110,y:307,height:214},
  {id:"sage",name:"苔色小院",texture:"sage",x:2510,y:507,height:210},
  {id:"reed",name:"芦苇屋",texture:"reed",x:2110,y:927,height:214},
  {id:"stone",name:"石溪居",texture:"stone",x:2530,y:1217,height:212},
] as const;
export const TOWN_ROADS:MapBox[]=[
  {x:80,y:332,w:1160,h:78},
  {x:182,y:300,w:85,h:65},{x:720,y:300,w:84,h:65},
  {x:1116,y:300,w:84,h:65},
  {x:990,y:332,w:80,h:280},{x:990,y:542,w:650,h:70},
  {x:1468,y:500,w:84,h:80},
  {x:990,y:542,w:1760,h:80},{x:990,y:542,w:80,h:660},
  {x:330,y:842,w:1040,h:80},{x:330,y:1122,w:2420,h:80},
  {x:1630,y:960,w:80,h:220},{x:2070,y:310,w:80,h:280},
  {x:2470,y:510,w:80,h:80},{x:2070,y:930,w:80,h:240},
  {x:2490,y:1220,w:80,h:120},{x:2660,y:542,w:80,h:798},
  {x:2440,y:1262,w:300,h:80},
  ...NEW_BUILDINGS.slice(0,3).map(b=>({x:b.x-40,y:b.y+4,w:80,h:90})),
  ...BRIDGES,
  ...STONE_APPROACH,
];
export const TOWN_PLAZAS:MapBox[]=[{x:355,y:288,w:255,h:194},{x:1080,y:332,w:150,h:94},{x:330,y:822,w:1040,h:100},{x:1590,y:980,w:160,h:116}];
export const TOWN_LAWNS:MapBox[]=[{x:1370,y:510,w:310,h:120}];
export const TOWN_BUILDINGS=[
  {id:"home",name:"暖灯小屋",use:"住宅 · 休息",texture:"home",x:226,y:307,height:216,labelY:338,solid:{x:122,y:192,w:204,h:106}},
  {id:"cafe",name:"麦香咖啡馆",use:"咖啡馆 · 进食",texture:"cafe",x:762,y:307,height:216,labelY:338,solid:{x:658,y:192,w:208,h:106}},
  {id:"store",name:"石榴杂货铺",use:"店铺 · 可探索",texture:"store",x:1158,y:307,height:220,labelY:338,solid:{x:1054,y:192,w:208,h:106}},
  {id:"cottage",name:"青篱小居",use:"住宅 · 可探索",texture:"cottage",x:1510,y:507,height:218,labelY:538,solid:{x:1410,y:392,w:200,h:106}},
  ...NEW_BUILDINGS.map(b=>({...b,use:"独立室内 · 可探索",labelY:b.y+31,solid:{x:b.x-100,y:b.y-110,w:200,h:101}})),
] as const;
export const TOWN_FENCES=[
  [94,301,82],[280,301,39],[642,301,54],[829,301,53],[99,495,247],[615,495,257],
  [1066,302,46],[1210,302,62],[1366,514,70],[1574,514,95],[1366,626,305],[300,809,60],[460,809,66],[2390,513,60],[2570,513,66],[1990,930,66],[2170,930,70],
];
export const TOWN_FLOWERS=[
  [109,276,64],[279,279,37],[644,278,51],[830,280,49],[411,263,144],[112,473,136],[703,473,132],
  [1054,285,52],[1218,287,54],[1374,509,56],[1598,513,60],[1438,626,148],[312,793,44],[468,793,52],[696,791,60],[1256,791,66],[2400,490,50],[2155,910,50],
];
export const TOWN_TREES=[
  [36,221,151,0],[101,143,130,0],[344,218,121,1],[602,210,136,0],[867,147,137,1],[929,282,142,0],
  [58,472,152,1],[179,555,156,0],[317,575,135,1],[694,562,162,0],[868,510,156,1],[939,443,131,0],[482,263,176,0],
  [1000,147,138,0],[1308,257,142,1],[1658,200,153,0],[1430,207,132,0],[1702,452,150,1],[1318,492,136,0],
  [1198,714,147,1],[1456,753,138,0],[1684,724,147,0],[935,709,154,0],
  [298,745,152,0],[625,771,138,1],[908,758,148,0],[1370,823,148,0],[1560,899,154,0],[1765,874,138,0],
  [1990,290,143,1],[2238,318,152,0],[2390,458,147,0],[2650,520,154,1],
  [1988,917,148,0],[2250,943,140,1],[2378,1180,142,0],[2680,1222,140,0],
  ...Array.from({length:13},(_,i)=>[170+i*193+(i%3)*17,1480+(i%4)*19,131+(i%5)*11,i%4===0?1:0]),
  ...Array.from({length:8},(_,i)=>[2770+(i%3)*7,130+i*160,137+(i%4)*9,i%3===0?1:0]),
];
export const TOWN_BENCHES=[[394,461],[576,461],[394,280],[576,280],[1200,416],[1430,619]];
export const TOWN_LAMPS=[[329,310],[631,310],[329,476],[631,476],[1084,434],[1090,526],[1580,574]];
export const RIVER_BLOCKS:MapBox[]=[{x:RIVER.x,y:0,w:RIVER.w,h:542},{x:RIVER.x,y:622,w:RIVER.w,h:500},{x:RIVER.x,y:1202,w:RIVER.w,h:398}];
export const TOWN_OBSTACLES:MapBox[]=[
  {x:446,y:423,w:68,h:40},{x:369,y:441,w:51,h:24},{x:551,y:441,w:51,h:24},
  ...TOWN_BUILDINGS.map(b=>b.solid),...RIVER_BLOCKS,
  ...TOWN_FENCES.map(([x,y,w])=>({x,y,w:w+5,h:27})),
  ...TOWN_FLOWERS.map(([x,y,w])=>({x,y:y+5,w,h:10})),
  ...TOWN_TREES.map(([x,y])=>({x:x-8,y:y-10,w:16,h:12})),
  ...TOWN_BENCHES.slice(4).map(([x,y])=>({x:x-25,y:y-18,w:50,h:20})),
  ...TOWN_LAMPS.slice(4).map(([x,y])=>({x:x-4,y:y-4,w:8,h:8})),
];
export const mapContains=(b:MapBox,x:number,y:number)=>x>=b.x&&x<=b.x+b.w&&y>=b.y&&y<=b.y+b.h;
