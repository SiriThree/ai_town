// V10.1 visual slice only. Never imported by simulation, navigation or storage.
// Keep all door anchors and collision geometry in town-map/scene-data unchanged.
export const LIVING_SLICE={x:300,y:90,w:1740,h:620};
export const GARDEN_PATCHES=[
  {x:370,y:218,rx:115,ry:53}, {x:936,y:249,rx:91,ry:72},
  {x:1289,y:312,rx:75,ry:104}, {x:892,y:457,rx:95,ry:86},
  {x:1225,y:487,rx:159,ry:37}, {x:1616,y:463,rx:70,ry:62},
  {x:1727,y:433,rx:74,ry:127}, {x:1987,y:425,rx:54,ry:97},
  {x:1708,y:671,rx:109,ry:34}, {x:1570,y:264,rx:178,ry:114},
];
// [foot x, foot y, height, blossom]. Trunks remain entirely off the old walkable land.
export const SLICE_TREES=[
  [689,160,88,0],[811,166,72,0],[1092,169,97,0],[1192,176,78,0],
  [1467,230,81,0],[1516,192,110,0],[1564,273,73,0],[1630,304,96,0],
  [1691,280,87,0],[1733,361,84,0],[1591,227,68,0],
  [368,210,91,0],[409,222,72,0],[575,241,68,0],
  [894,257,81,0],[976,275,103,0],[948,195,67,0],[1016,290,61,0],
  [1268,296,88,0],[1333,335,73,0],[1284,438,71,0],
  [875,474,79,0],[936,489,103,0],[897,549,66,0],
  [1136,491,51,0],[1284,496,60,0],[1394,476,73,0],
  [1662,496,82,0],[1761,414,115,0],[1739,493,61,0],[1790,305,83,0],
  [1971,359,92,0],[1997,466,78,0],[1719,678,68,0],
] as const;
export type StreetProp={kind:"crate"|"barrel"|"sign"|"planter";x:number;y:number};
export const STREET_PROPS:StreetProp[]=[
  {kind:"sign",x:875,y:318},{kind:"barrel",x:902,y:320},
  {kind:"planter",x:654,y:322},{kind:"planter",x:1008,y:318},
  {kind:"crate",x:1272,y:337},{kind:"crate",x:1296,y:354},{kind:"barrel",x:1264,y:374},
  {kind:"sign",x:1234,y:314},{kind:"barrel",x:1372,y:497},
  {kind:"planter",x:1759,y:528},{kind:"planter",x:1975,y:529},
];
export const SLICE_FLOWERS=[
  [925,310,62],[885,440,52],[1132,498,106],[1280,470,48],
  [1710,520,61],[1978,513,42],[1628,650,79],
];
// Low stone retaining edges frame planted (already non-walkable) land, not new barriers.
export const GARDEN_EDGES=[
  [874,323,100],[1078,460,207],[1248,432,88],[1677,531,104],
  [1960,531,63],[1600,665,160],
];

export const SHORE_ROCKS=[[1815,212,26],[1925,243,31],[1813,291,34],[1932,344,29],[1820,391,23],[1811,472,32],[1931,465,35],[1819,648,26],[1927,654,31]];

// Side/back garden fences finish existing storefront plots without closing the door lanes.
export const COURTYARD_FENCES=[
  {x:634,y:188,length:126,vertical:true},{x:894,y:214,length:105,vertical:true},
  {x:637,y:176,length:225,vertical:false},
  {x:1038,y:187,length:128,vertical:true},{x:1298,y:233,length:80,vertical:true},
  {x:1040,y:174,length:229,vertical:false},
  {x:1376,y:414,length:80,vertical:true},{x:1650,y:400,length:92,vertical:true},
];
