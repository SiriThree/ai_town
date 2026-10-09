import {advanceWorld,type World} from "../../src/lib/world";
export function until(w:World,predicate:(w:World)=>boolean,limit=4000):World {
  for(let i=0;i<limit;i++){w=advanceWorld(w);if(predicate(w))return w;}
  throw new Error("Action did not reach its real completion condition");
}
export function completeAction(w:World,id="aqing"):World{return until(w,next=>!next.npcs.find(n=>n.id===id)!.ongoing);}
