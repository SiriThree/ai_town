import type {World,Npc} from "./world";
import {recordExperience,relationFor,personalMemories} from "./experiences";
import type {ChatReply} from "./chat-types";
export type PublicConversation={id:string;eventId:number;minute:number;sceneId:Npc["sceneId"];participants:string[];speakers:Npc[];turns:(ChatReply&{npcId:string})[];modelState:"local"|"claimed"|"done"};
export function canTalk(a:Npc,b:Npc,w:World){
  if(a.id===b.id||a.sceneId!==b.sceneId||Math.hypot(a.position.x-b.position.x,a.position.y-b.position.y)>100)return false;
  if([a,b].some(n=>n.lastPath.length||n.energy<30||n.hunger>=65||/休息|制作|理货|整理|协助/.test(n.action)))return false;
  if(![a,b].some(n=>n.personality==="outgoing"&&n.mood<85)&&(relationFor(w,a.id,b.id)?.familiarity??0)<5)return false;
  return !w.conversations?.some(c=>w.minute-c.minute<120&&c.participants.some(id=>id===a.id||id===b.id));
}
export function beginSocial(world:World){
  if(!world.rosterVersion)return;
  const prior=world.conversations??[];
  if(prior.at(-1)&&world.minute-prior.at(-1)!.minute<30)return;
  const day=Math.floor(world.minute/1440);
  if(world.socialBudget?.day===day&&world.socialBudget.used>=8)return;
  for(const a of world.npcs)for(const b of world.npcs){
    if(a.id>=b.id||!canTalk(a,b,world))continue;
    const place=world.locations.find(l=>l.id===a.location)!.name,id=`social:${world.revision}:${a.id}:${b.id}`;
    const event=recordExperience(world,[a.id,b.id],"conversation",id,`${a.name}与${b.name}在${place}碰面并交谈。`);if(!event)return;
    const familiar=(relationFor(world,a.id,b.id)?.familiarity??0)>1;
    const remember=personalMemories(world,a.id).filter(m=>m.eventId!==event.id).at(-1);
    const lines=[`${b.name}，在${place}遇到你真好。${remember?`我还记得${remember.summary}`:a.personality==="outgoing"?"今天也想听听邻居的近况。":"我正想安静观察一下这里。"}`,
      `${a.name}，${familiar?"又见面了。":"很高兴认识你。"}我现在${b.action}，${b.personality==="quiet"?"我们慢慢聊，之后我想读一会儿书。":"聊一会儿日常，心情也轻松一些。"}`];
    const c:PublicConversation={id,eventId:event.id,minute:world.minute,sceneId:a.sceneId,participants:[a.id,b.id],speakers:structuredClone([a,b]),turns:[a,b].map((n,i)=>({npcId:n.id,reply:lines[i],source:"fallback",reason:"disabled"})),modelState:"local"};
    world.conversations=[...prior,c].slice(-30);world.socialBudget={day,used:world.socialBudget?.day===day?world.socialBudget.used+1:1};return;
  }
}

export function assertSocial(w:World){
  if(!w.conversations)return;
  if(w.conversations.length>30||new Set(w.conversations.map(c=>c.id)).size!==w.conversations.length)throw new Error("交流记录重复或超限");
  for(const c of w.conversations){
    const event=w.experiences?.facts.find(e=>e.id===c.eventId);
    if(!event||c.participants.length!==2||new Set(c.participants).size!==2||c.turns.length!==2||c.turns.some(t=>!c.participants.includes(t.npcId)||!['ai','fallback'].includes(t.source)||typeof t.reply!=="string"||t.reply.length>4000)||c.participants.some(id=>!event.participants.includes(id)))throw new Error("交流缺少合法事件来源");
  }
}
