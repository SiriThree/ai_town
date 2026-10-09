// Stable authored identities. Migration appends missing IDs; it never replaces existing residents.
export const RESIDENTS=[
  {id:"xiaoyu",name:"小雨",personality:"outgoing",homeId:"rose",job:"cafe",preference:"service",bio:"咖啡馆备餐员，做事利落，喜欢照顾来店里的邻居。",appearance:"xiaoyu"},
  {id:"laolin",name:"老林",personality:"quiet",homeId:"sage",job:"store",preference:"service",bio:"杂货铺理货员，稳重细心，习惯先把手边的事情安排好。",appearance:"laolin"},
  {id:"muxi",name:"沐溪",personality:"quiet",homeId:"reed",preference:"home",bio:"喜欢花草和炉边阅读，重视休息，宁愿慢慢完成一天的事情。",appearance:"muxi"},
  {id:"xiaoman",name:"小满",personality:"outgoing",homeId:"stone",preference:"social",bio:"爱串门的读书人，喜欢公共场所，对邻居的新鲜事很感兴趣。",appearance:"xiaoman"},
] as const;
