import {describe,it,expect} from "vitest";
import {chatFeedback} from "../src/lib/chat-feedback";
import {canStand,PORTALS,validScenePath} from "../src/lib/scene-data";
import {findScenePath} from "../src/lib/navigation";
import {enterPortal,movePlayer,newPlayer,type Player} from "../src/lib/player-scene";
import {interactionTarget} from "../src/lib/interaction";
import {LANDSCAPE_TREES} from "../src/lib/town-landscape";
import {STONE_APPROACH} from "../src/lib/town-map";
describe("V10.4 interaction and access",()=>{
  it("reports message lifecycle instead of claiming an indefinite conversation",()=>{
    expect(chatFeedback("阿晴","ready",true,true)).toContain("尚未发送");
    expect(chatFeedback("阿晴","sending",true,true)).toContain("等待阿晴回复");
    expect(chatFeedback("阿晴","replied",true,true)).toContain("本轮回复已完成");
    expect(chatFeedback("阿晴","replied",true,false)).toContain("继续行动");
    expect(chatFeedback("阿晴","ready",false,false)).toContain("另一场景");
    expect(chatFeedback("阿晴","error",true,true)).toContain("未确认");
  });
  it("walks around Stone's west wall, never through it, and uses the real south door from all sides",()=>{
    const door=PORTALS.find(p=>p.id==="stone-door")!;
    for(const from of [{x:2410,y:1162},{x:2700,y:1300},{x:2530,y:1300}]){
      const route=findScenePath("town",from,door.position);expect(validScenePath("town",route)).toBe(true);
      if(from.x===2410){expect(route.every(p=>p.x<=2530&&p.y>=1160)).toBe(true);}
    }
    let player:Player={...newPlayer(),position:{x:2410,y:1162},facing:"south"};
    for(let i=0;i<160;i++)player=movePlayer(player,1,0,.02);
    expect(player.position.x).toBeLessThanOrEqual(2421); // west wall + foot radius
    for(let i=0;i<160;i++)player=movePlayer(player,0,1,.02);
    expect(player.position.y).toBeGreaterThan(1230);
    for(const x of [2516,2530,2544]){
      const p:Player={...newPlayer(),position:{x,y:1234}};
      expect(interactionTarget(p,[])?.id).toBe("stone-door");
      const inside=enterPortal(p,"stone-door");expect(inside.sceneId).toBe("stone_interior");
      const outside=enterPortal(inside,"stone-exit");expect(outside.position).toEqual({x:2530,y:1234});expect(canStand("town",outside.position)).toBe(true);
    }
  });
  it("all twelve doors and return points stay connected; workshop bridge walk remains legal",()=>{
    for(const door of PORTALS.filter(p=>p.source==="town")){
      expect(validScenePath("town",findScenePath("town",newPlayer().position,door.position)),door.id).toBe(true);
      const exit=PORTALS.find(p=>p.id===door.reverseId)!;
      expect(canStand(door.target,door.spawn)).toBe(true);expect(canStand("town",exit.spawn)).toBe(true);
      expect(interactionTarget({...newPlayer(),position:exit.spawn},[])?.id).toBe(door.id);
    }
    expect(validScenePath("town",findScenePath("town",{x:1670,y:974},{x:1875,y:1160}))).toBe(true);
  });
  it("foreground grove crowns leave the narrow Stone approach visible",()=>{
    for(const [x,y,h]of LANDSCAPE_TREES)expect(STONE_APPROACH.some(b=>x+h*.55>b.x&&x-h*.55<b.x+b.w&&y>b.y&&y-h<b.y+b.h)).toBe(false);
  });
});
