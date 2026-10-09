import {canStand,SCENES,type SceneId} from "./scene-data";
import type {Point} from "./world";
// Small static grid shared by map checks and later resident routes. No browser or simulation state.
const grids=new Map<SceneId,{width:number;height:number;open:Uint8Array}>();
const STEP=10;
// Four units of clearance tolerate continuous keyboard stopping between grid points.
const clear=(scene:SceneId,p:Point)=>[[0,0],[-4,0],[4,0],[0,-4],[0,4]].every(([x,y])=>canStand(scene,{x:p.x+x,y:p.y+y}));
function grid(scene:SceneId){
  let value=grids.get(scene);if(value)return value;
  const size=SCENES[scene].size,width=Math.ceil(size.width/STEP),height=Math.ceil(size.height/STEP),open=new Uint8Array(width*height);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++)open[y*width+x]=Number(clear(scene,{x:x*STEP,y:y*STEP}));
  value={width,height,open};grids.set(scene,value);return value;
}
function segment(scene:SceneId,a:Point,b:Point){
  if(a.x!==b.x&&a.y!==b.y)return false;
  const count=Math.ceil(Math.hypot(a.x-b.x,a.y-b.y)/2);
  for(let i=0;i<=count;i++)if(!canStand(scene,{x:a.x+(b.x-a.x)*i/(count||1),y:a.y+(b.y-a.y)*i/(count||1)}))return false;
  return true;
}
function join(scene:SceneId,p:Point){
  for(let radius=0;radius<=2;radius++)for(let dy=-radius;dy<=radius;dy++)for(let dx=-radius;dx<=radius;dx++){
    const q={x:(Math.round(p.x/STEP)+dx)*STEP,y:(Math.round(p.y/STEP)+dy)*STEP};
    if(!clear(scene,q))continue;
    for(const bend of [{x:p.x,y:q.y},{x:q.x,y:p.y}])if(segment(scene,p,bend)&&segment(scene,bend,q))return [p,bend,q];
  }
  return null;
}
export function findScenePath(scene:SceneId,start:Point,end:Point):Point[]{
  const a=join(scene,start),b=join(scene,end);if(!a||!b)return [];
  const {width,height,open}=grid(scene),index=(p:Point)=>p.y/STEP*width+p.x/STEP;
  const first=index(a[2]),last=index(b[2]),parents=new Int32Array(width*height).fill(-1),queue=[first];parents[first]=first;
  for(let head=0;head<queue.length&&parents[last]===-1;head++){
    const i=queue[head],x=i%width,y=Math.floor(i/width);
    for(const [nx,ny]of [[x-1,y],[x+1,y],[x,y-1],[x,y+1]]){
      if(nx<0||ny<0||nx>=width||ny>=height)continue;
      const ni=ny*width+nx;if(!open[ni]||parents[ni]!==-1)continue;
      if(!segment(scene,{x:x*STEP,y:y*STEP},{x:nx*STEP,y:ny*STEP}))continue;
      parents[ni]=i;queue.push(ni);
    }
  }
  if(parents[last]===-1)return [];
  const path:Point[]=[];for(let i=last;;i=parents[i]){path.push({x:i%width*STEP,y:Math.floor(i/width)*STEP});if(i===first)break;}
  const combined=[...a,...path.reverse(),...b.toReversed()],result:Point[]=[];
  for(const p of combined){const prev=result.at(-1),before=result.at(-2);if(prev?.x===p.x&&prev.y===p.y)continue;
    if(before&&prev&&((before.x===prev.x&&prev.x===p.x)||(before.y===prev.y&&prev.y===p.y)))result.pop();result.push({...p});}
  return result;
}
