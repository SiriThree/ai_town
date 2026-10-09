"use client";
import { useEffect,useRef,useState, type RefObject } from "react";
import { movePlayer,newPlayer,PLAYER_KEY,playerPose,restorePlayer,type Player } from "../lib/player-scene";

export function usePlayer(viewport:RefObject<HTMLDivElement|null>,blocked:boolean,ready:boolean,onInteract:(player:Player)=>Player) {
  const [player,setPlayer]=useState(newPlayer);
  const [pose,setPose]=useState(()=>playerPose(newPlayer(),false,0));
  const current=useRef(player),block=useRef(blocked),loaded=useRef(ready),interact=useRef(onInteract);
  useEffect(()=>{block.current=blocked;loaded.current=ready;interact.current=onInteract;},[blocked,ready,onInteract]);
  useEffect(()=>{
    const keys=new Set<string>();let frame=0,last=0,lastSave=0;
    const persist=()=>{try{sessionStorage.setItem(PLAYER_KEY,JSON.stringify(current.current));}catch{/* Avatar remains usable without browser storage. */}};
    const publish=(p:Player,moving=false,now=0)=>{current.current=p;setPlayer(p);setPose(playerPose(p,moving,now));};
    try{publish(restorePlayer(JSON.parse(sessionStorage.getItem(PLAYER_KEY)||"null")));}catch{publish(newPlayer());}
    const stop=()=>{keys.clear();cancelAnimationFrame(frame);frame=0;publish(current.current);persist();};
    const inputFocused=()=>!!document.activeElement?.closest("input,textarea,select,button,[contenteditable=true],dialog[open]")||!!document.querySelector("dialog[open]");
    const tick=(now:number)=>{
      frame=0;
      if(block.current||!loaded.current||inputFocused()||document.hidden){stop();return;}
      const dx=Number(keys.has("d")||keys.has("arrowright"))-Number(keys.has("a")||keys.has("arrowleft"));
      const dy=Number(keys.has("s")||keys.has("arrowdown"))-Number(keys.has("w")||keys.has("arrowup"));
      const before=current.current,next=movePlayer(before,dx,dy,(now-last)/1000);last=now;
      publish(next,next.position.x!==before.position.x||next.position.y!==before.position.y,now);
      if(now-lastSave>250){persist();lastSave=now;}
      if(keys.size)frame=requestAnimationFrame(tick);
    };
    const down=(e:KeyboardEvent)=>{
      const key=e.key.toLowerCase();
      if(block.current||!loaded.current||inputFocused()||e.ctrlKey||e.metaKey||e.altKey)return;
      if(document.activeElement!==viewport.current&&document.activeElement!==document.body)return;
      if(key==="e"){
        e.preventDefault();if(e.repeat)return;
        stop();publish(interact.current(current.current));persist();return;
      }
      if(!["w","a","s","d","arrowup","arrowdown","arrowleft","arrowright"].includes(key))return;
      e.preventDefault();keys.add(key);if(!frame){last=performance.now();frame=requestAnimationFrame(tick);}
    };
    const up=(e:KeyboardEvent)=>{keys.delete(e.key.toLowerCase());if(!keys.size)stop();};
    const focus=()=>{if(inputFocused())stop();};
    window.addEventListener("keydown",down);window.addEventListener("keyup",up,true);
    window.addEventListener("blur",stop);window.addEventListener("pagehide",persist);
    document.addEventListener("visibilitychange",stop);document.addEventListener("focusin",focus);
    return ()=>{persist();cancelAnimationFrame(frame);window.removeEventListener("keydown",down);window.removeEventListener("keyup",up,true);window.removeEventListener("blur",stop);window.removeEventListener("pagehide",persist);document.removeEventListener("visibilitychange",stop);document.removeEventListener("focusin",focus);};
  },[viewport]);
  return {player,pose};
}
