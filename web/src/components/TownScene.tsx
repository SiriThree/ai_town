"use client";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import type { Application,Container } from "pixi.js";
import type { ResidentArt } from "./scene-art";
import { usePlayer } from "./use-player";
import { nearbyPortal, SCENES, residentScene, type SceneId } from "../lib/player-scene";
import { ART_PIXEL, acceptPosition, poseAt, stillAt, type Motion, type Pose } from "../lib/scene-motion";
import { FALLBACK_LABELS, type ChatTurn } from "../lib/chat-types";
import { boundedCamera, bubblePlacement, sceneTransform, type Camera } from "../lib/scene-view";
import { MAP, worldTime, type World } from "../lib/world";

export default function TownScene({ world, selected, onSelect, speech, onExpand, controlsBlocked, onSceneChange }: { controlsBlocked:boolean; onSceneChange:(id:SceneId)=>void; world: World; selected: string; onSelect: (id: string) => void; speech: ChatTurn | null; onExpand: () => void }) {
  const viewport = useRef<HTMLDivElement>(null);
  const [renderReady,setRenderReady]=useState(false);
  const {player,pose:heroPose}=usePlayer(viewport,controlsBlocked,renderReady);
  const sceneId=player.sceneId;
  const portal=nearbyPortal(player);
  const [size, setSize] = useState({width:960,height:600});
  const [camera, setCamera] = useState<Camera>({zoom:1,x:0,y:0});
  const [poses,setPoses]=useState<Record<string,Pose>>(()=>Object.fromEntries(world.npcs.map(n=>[n.id,poseAt(stillAt(n.position),0)])));
  const cameras=useRef<Record<SceneId,Camera>>({town:{zoom:1,x:0,y:0},cafe_interior:{zoom:1,x:0,y:0}});
  const cameraScene=useRef<SceneId>("town");
  useEffect(()=>{
    if(cameraScene.current!==sceneId){cameras.current[cameraScene.current]=camera;cameraScene.current=sceneId;setCamera(cameras.current[sceneId]);}
    onSceneChange(sceneId);
  },[sceneId,camera,onSceneChange]);
  const drag = useRef<{id:number;x:number;y:number;camera:Camera}|null>(null);
  useEffect(()=>{
    const element=viewport.current!;
    const observer=new ResizeObserver(([entry])=>setSize({width:entry.contentRect.width,height:entry.contentRect.height}));
    observer.observe(element);return ()=>observer.disconnect();
  },[]);
  const transform=sceneTransform(size,camera,sceneId);
  const speaker=world.npcs.find(n=>n.id===selected);
  const bubble=speaker && residentScene(speaker)===sceneId && speech ? bubblePlacement(poses[speaker.id]?.position ?? speaker.position,size,camera,{width:290,height:164},sceneId) : null;
  const baseScale=sceneTransform(size,{zoom:1,x:0,y:0},sceneId).scale;
  function zoom(amount:number){setCamera(c=>boundedCamera({...c,zoom:c.zoom+(size.width>=600?Math.sign(amount)*.5/baseScale:amount)},size));}

  const host = useRef<HTMLDivElement>(null);
  const renderer = useRef<{ sync:(world:World)=>void } | null>(null);
  const latest = useRef({ world, selected, sceneId, heroPose });
  const [error, setError] = useState("");
  useEffect(() => {
    latest.current = { world, selected, sceneId, heroPose };
    const r = renderer.current;
    r?.sync(world);
  }, [world, selected, sceneId, heroPose]);
  useEffect(() => {
    let cancelled = false;
    let localApp: Application | undefined;
    let ready = false;
    let animationFrame=0;
    async function start() {
      const [{ Application }, { drawTown, drawResident, loadSceneArt },{loadPlayerArt,drawPlayer,drawCafe}] = await Promise.all([import("pixi.js"), import("./scene-art"),import("./player-art")]);
      const [art,playerArt]=await Promise.all([loadSceneArt(),loadPlayerArt()]);
      if (cancelled) return;
      localApp = new Application();
      await localApp.init({ width: MAP.width/ART_PIXEL, height: MAP.height/ART_PIXEL, background: 0x8ba35e, antialias: false, resolution: 1, autoStart: false, preference: "webgl" });
      localApp.stage.scale.set(1/ART_PIXEL);
      ready = true;
      if (cancelled) { localApp.destroy(true, { children: true }); return; }
      host.current!.appendChild(localApp.canvas);
      localApp.canvas.setAttribute("aria-label", "晨露村地图：住宅、咖啡馆、广场与两名居民");
      const actors=new Map<string,ResidentArt>();
      const motions=new Map<string,Motion>();
      let activeScene:SceneId|undefined;
      let sceneObjects:Container;
      let hero=drawPlayer(playerArt);
      // Only one scene tree is attached. Shared cached textures survive container disposal.
      const mountScene=()=>{
        for(const child of localApp!.stage.removeChildren())child.destroy({children:true});
        actors.clear();motions.clear();activeScene=latest.current.sceneId;
        const {ground,objects}=activeScene==="town"?drawTown(art):drawCafe(playerArt);
        localApp!.stage.addChild(ground,objects);sceneObjects=objects;
        const current=latest.current;
        for(const n of current.world.npcs.filter(n=>residentScene(n)===activeScene)){
          const actor=drawResident(n,current.selected===n.id,art);actors.set(n.id,actor);motions.set(n.id,stillAt(n.position,"south",n.sceneId));objects.addChild(actor.node);
        }
        hero=drawPlayer(playerArt);hero.update(current.heroPose);objects.addChild(hero.node);
        localApp!.canvas.setAttribute("aria-label",SCENES[activeScene].name+"游戏场景");
        host.current!.dataset.objects=String(objects.children.length);
        host.current!.dataset.scene=activeScene;
        setPoses(Object.fromEntries([...motions].map(([id,m])=>[id,poseAt(m,performance.now())])));
        localApp!.render();
      };
      hero.node.destroy({children:true});mountScene();
      let paints=1;
      const paint=(now:number)=>{
        animationFrame=0;if(cancelled)return;
        const next:Record<string,Pose>={};let changed=false,moving=false;
        for(const [id,motion]of motions){const pose=poseAt(motion,now);next[id]=pose;moving ||= pose.moving;changed=actors.get(id)!.update(pose,latest.current.selected===id)||changed;}
        const heroChanged=hero.update(latest.current.heroPose);
        if(changed||heroChanged){localApp!.render();host.current!.dataset.paints=String(++paints);}
        if(changed)setPoses(next);
        if(moving)animationFrame=requestAnimationFrame(paint);
      };
      renderer.current = { sync:(nextWorld)=>{
        if(activeScene!==latest.current.sceneId)mountScene();
        const now=performance.now();
        let membershipChanged=false;
        for(const [id,actor] of actors){
          if(!nextWorld.npcs.some(n=>n.id===id&&residentScene(n)===activeScene)){
            sceneObjects.removeChild(actor.node);actor.node.destroy({children:true});actors.delete(id);motions.delete(id);membershipChanged=true;
          }
        }
        for(const n of nextWorld.npcs.filter(n=>residentScene(n)===activeScene&&!actors.has(n.id))){
          const actor=drawResident(n,latest.current.selected===n.id,art);actors.set(n.id,actor);
          motions.set(n.id,stillAt(n.position,"south",n.sceneId));sceneObjects.addChild(actor.node);membershipChanged=true;
        }
        if(membershipChanged){setPoses(Object.fromEntries([...motions].map(([id,m])=>[id,poseAt(m,now)])));localApp!.render();host.current!.dataset.objects=String(sceneObjects.children.length);}
        nextWorld.npcs.filter(n=>motions.has(n.id)).forEach(n=>motions.set(n.id,acceptPosition(motions.get(n.id)!,n,now)));
        if(!animationFrame)animationFrame=requestAnimationFrame(paint);
      }};
      setPoses(Object.fromEntries([...motions].map(([id,m])=>[id,poseAt(m,performance.now())])));
      localApp.render();
      host.current!.dataset.ready = "true";
      host.current!.dataset.paints = "1";setRenderReady(true);
    }
    start().catch(() => { if(!cancelled) setError("场景渲染未能启动。请使用支持 WebGL 的浏览器；下方居民入口仍可查看真实存档。"); });
    return () => { cancelled = true; cancelAnimationFrame(animationFrame);renderer.current = null; if (ready && localApp) localApp.destroy(true, { children: true }); };
  }, []);
  return <div ref={viewport} className={`scene ${sceneId}`} tabIndex={0} data-scene={sceneId} data-testid="scene-viewport" aria-label="小镇场景"
    onPointerDown={e=>{if(e.button!==0 || (e.target as HTMLElement).closest("button,aside"))return;e.preventDefault();e.currentTarget.focus({preventScroll:true});drag.current={id:e.pointerId,x:e.clientX,y:e.clientY,camera};e.currentTarget.setPointerCapture(e.pointerId);}}
    onPointerMove={e=>{const d=drag.current;if(d && d.id===e.pointerId)setCamera(boundedCamera({...d.camera,x:d.camera.x+e.clientX-d.x,y:d.camera.y+e.clientY-d.y},size));}}
    onPointerUp={()=>{drag.current=null;}} onPointerCancel={()=>{drag.current=null;}}>
    {/* Size the canvas directly: scaling its ancestor would let the compositor blur pixel edges. */}
    <div ref={host} className="canvas-host" data-testid="scene-canvas" style={{left:transform.x,top:transform.y,width:MAP.width*transform.scale,height:MAP.height*transform.scale}} />
    <div className="world-plane" data-testid="world-plane" style={{width:MAP.width,height:MAP.height,transform:`translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})`}}>
      {sceneId==="town" && <><div className="place-label home-label">暖灯小屋<small>住宅 · 休息</small></div>
      <div className="place-label cafe-label">麦香咖啡馆<small>咖啡馆 · 进食</small></div>
      <div className="place-label square-label">树荫广场<small>社交 · 阅读</small></div></>}
      {world.npcs.filter(n=>residentScene(n)===sceneId).map(n => <button key={n.id} aria-label={`查看${n.name}`} aria-pressed={selected === n.id} data-testid={`npc-${n.id}`} data-motion={poses[n.id]?.moving?"walking":"idle"} data-facing={poses[n.id]?.facing} data-frame={poses[n.id]?.frame} className={`npc-target ${selected === n.id ? "selected" : ""}`} style={{ left:poses[n.id]?.position.x ?? n.position.x,top:poses[n.id]?.position.y ?? n.position.y }} onClick={() => onSelect(n.id)}><span>{n.name}</span></button>)}
      <span className="player-marker" data-testid="player" data-scene={sceneId} data-x={player.position.x.toFixed(2)} data-y={player.position.y.toFixed(2)} data-facing={heroPose.facing} data-motion={heroPose.moving?"walking":"idle"} style={{left:heroPose.position.x,top:heroPose.position.y}}><small>你</small></span>
      {SCENES[sceneId].portals.map(p=><span key={p.id} className={`door-marker ${portal?.id===p.id?"near":""}`} style={{left:p.position.x,top:p.position.y}} aria-hidden>◇</span>)}
    </div>
    {error && <p role="alert" className="scene-error">{error}</p>}
    <div className="map-caption"><span>{sceneId==="town"?"晨露村手记":"麦香咖啡馆"}</span><small>{sceneId==="town"?"沿街散步，去喝杯咖啡。":"木香与咖啡 · 独立室内场景"}</small></div>
    <div className="camera-tools" aria-label="地图镜头"><button aria-label="缩小地图" disabled={camera.zoom<=1} onClick={()=>zoom(-.25)}>−</button><output aria-label="地图缩放">{Math.round(transform.scale/baseScale*100)}%</output><button aria-label="放大地图" disabled={camera.zoom>=2} onClick={()=>zoom(.25)}>＋</button><button onClick={()=>setCamera({zoom:1,x:0,y:0})}>复位</button></div>
    {bubble && speaker && speech && <aside className="speech-bubble" data-testid="speech-bubble" data-npc={speaker.id} aria-label={`${speaker.name}的发言`} style={{left:bubble.left,top:bubble.top,width:bubble.width,height:bubble.height,"--tail-x":`${bubble.tail}px`} as CSSProperties}>
      <div className="speech-content" aria-live="polite"><div className="reply-heading"><strong>{speaker.name}</strong><span data-testid="reply-source" className={`source-badge ${speech.source}`}>{speech.source==="ai"?(speech.testMode?"AI · 本地测试替身":"AI 回复"):`降级回复 · ${FALLBACK_LABELS[speech.reason!] || "本地规则"}`}</span></div><p data-testid="chat-reply">{speech.reply}</p><small>{worldTime(speech.minute)} · {speech.worldRevision===world.revision?"本次状态":"历史发言 · 世界已更新"}</small><button onClick={onExpand}>展开全文与历史 ↗</button></div>
      <i className="bubble-tail" aria-hidden />
    </aside>}
    <div className="player-controls" data-testid="player-controls">{portal?<strong data-testid="portal-hint">E · {portal.label}</strong>:<span>WASD / 方向键走动 · 靠近门口按 E</span>}<small>{sceneId==="town"?"点击地面控制化身 · 拖动平移 · 点击居民对话":"只显示此处的居民 · 下方门口返回街角"}</small></div>
  </div>;
}
