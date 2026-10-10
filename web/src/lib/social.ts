import {STEP_MS} from "./action-time";
import {shortEnough} from "./dialogue-text";
import type {World,Npc} from "./world";
import {recordExperience,relationFor} from "./experiences";
import type {ChatReply} from "./chat-types";
export type PublicConversation={id:string;eventId:number;minute:number;sceneId:Npc["sceneId"];participants:string[];speakers:Npc[];timeline?:{turnIndex:number;elapsedMs:number;completed:boolean};turns:(ChatReply&{npcId:string;rejectedReply?:string})[];modelState:"local"|"claimed"|"done"};
export const TURN_MS=5000;
export function activeConversation(w:World,id:string){return w.conversations?.find(c=>c.timeline&&!c.timeline.completed&&c.participants.includes(id));}
export function advanceConversations(w:World){
  const held=new Set<string>();
  for(const c of w.conversations??[]){const t=c.timeline;if(!t||t.completed)continue;
    c.participants.forEach(id=>held.add(id));t.elapsedMs=Math.min(c.turns.length*TURN_MS,t.elapsedMs+STEP_MS);
    t.completed=t.elapsedMs===c.turns.length*TURN_MS;t.turnIndex=Math.min(c.turns.length-1,Math.floor(t.elapsedMs/TURN_MS));
    for(const id of c.participants){const n=w.npcs.find(n=>n.id===id)!,other=w.npcs.find(n=>n.id!==id&&c.participants.includes(n.id))!;
      n.lastPath=[];n.action=t.completed?"结束交谈":`与${other.name}交谈 · 第${t.turnIndex+1}/${c.turns.length}句`;
      const dx=other.position.x-n.position.x,dy=other.position.y-n.position.y;n.facing=Math.abs(dx)>Math.abs(dy)?(dx>0?"east":"west"):(dy>0?"south":"north");
    }
  }
  return held;
}
export function canTalk(a:Npc,b:Npc,w:World){
  if([a,b].some(n=>n.appointment&&["accepted","waiting","travelling"].includes(n.appointment.status)))return false;
  if(a.id===b.id||a.sceneId!==b.sceneId||Math.hypot(a.position.x-b.position.x,a.position.y-b.position.y)>100)return false;
  if([a,b].some(n=>activeConversation(w,n.id)|| (n.ongoing&&!["read","wait","socialize"].includes(n.ongoing.decision.action.kind)) || n.lastPath.length||n.energy<30||n.hunger>=65||/休息|制作|理货|整理|协助/.test(n.action)))return false;
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
    const sharedWork=world.experiences?.facts.some(f=>f.kind==="work"&&[a.id,b.id].every(id=>f.participants.includes(id)));
    const lines=[sharedWork?`${b.name}，上次一起做事，多谢你帮忙。`:
      `${b.name}，${familiar?"又见面了，最近过得怎么样？":"歇一会儿，聊聊今天的近况？"}`,
      b.personality==="quiet"?"嗯，慢慢聊一会儿，我很愿意听。":"好呀，见到你真高兴！最近还顺利吗？"];
    const c:PublicConversation={id,eventId:event.id,minute:world.minute,sceneId:a.sceneId,participants:[a.id,b.id],speakers:structuredClone([a,b]),turns:[a,b].map((n,i)=>({npcId:n.id,reply:lines[i],source:"fallback",reason:"disabled"})),modelState:"local",timeline:{turnIndex:0,elapsedMs:0,completed:false}};
    for(const n of [a,b]){delete n.ongoing;n.lastPath=[];n.action=`与${n.id===a.id?b.name:a.name}交谈 · 第1/2句`;const other=n.id===a.id?b:a;n.facing=other.position.x>n.position.x?"east":"west";}
    c.speakers=structuredClone([a,b]);
    world.conversations=[...prior,c].slice(-30);world.socialBudget={day,used:world.socialBudget?.day===day?world.socialBudget.used+1:1};return;
  }
}

export function assertSocial(w:World){
  if(!w.conversations)return;
  if(w.conversations.length>30||new Set(w.conversations.map(c=>c.id)).size!==w.conversations.length)throw new Error("交流记录重复或超限");
  for(const c of w.conversations){
    if(c.timeline){const t=c.timeline;if(!Number.isInteger(t.elapsedMs)||t.elapsedMs<0||t.elapsedMs>TURN_MS*c.turns.length||t.turnIndex!==Math.min(c.turns.length-1,Math.floor(t.elapsedMs/TURN_MS))||t.completed!==(t.elapsedMs===TURN_MS*c.turns.length)||c.turns.some(t=>!shortEnough(t.reply)))throw new Error("交流轮次无效");
      if(!t.completed&&c.participants.some(id=>{const n=w.npcs.find(n=>n.id===id);return !n||n.sceneId!==c.sceneId||!!n.ongoing||w.conversations!.some(other=>other.id!==c.id&&other.timeline&&!other.timeline.completed&&other.participants.includes(id));}))throw new Error("居民重复参与或跨场景交谈");
    }
    const event=w.experiences?.facts.find(e=>e.id===c.eventId);
    if(!event||c.participants.length!==2||new Set(c.participants).size!==2||c.turns.length!==2||c.turns.some(t=>!c.participants.includes(t.npcId)||!['ai','fallback'].includes(t.source)||typeof t.reply!=="string"||t.reply.length>4000)||c.participants.some(id=>!event.participants.includes(id)))throw new Error("交流缺少合法事件来源");
  }
}
