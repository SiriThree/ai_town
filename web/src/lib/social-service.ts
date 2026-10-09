import {updateWorld,worldId} from "./store";
import {modelReply,aiConfig,type AIConfig} from "./chat-model";
import {reserveChatQuota} from "./chat-limits";
import {buildMessages} from "./chat-context";
import type {World} from "./world";
import type {PublicConversation} from "./social";
export async function socialReplies(c:PublicConversation,w:World,config:AIConfig,transport:typeof fetch=fetch,reserve=async()=>true){
  const turns=[];
  for(let i=0;i<c.speakers.length;i++){
    const n=c.speakers[i],other=c.speakers[1-i];
    const messages=buildMessages(n,{...w,minute:c.minute,events:w.events.filter(e=>e.minute<=c.minute)},[],`你正在与${other.name}在同一场景交流。只说一句简短自然的日常话，不代替对方发言。对方身份：${other.bio??other.personality}。${i?`对方刚说：${turns[0].reply}`:"主动问候对方，已知经历可以提及，不编造未知事情。"}`);
    const reply=await modelReply(messages,()=>c.turns[i].reply,{...config,timeoutMs:Math.min(2000,config.timeoutMs)},transport,undefined,reserve);
    turns.push({...reply,npcId:n.id});
  }
  return turns;
}
// Scheduled with Next's bounded after-response hook. Never holds a world lock over model I/O.
export async function enrichSocial(id=worldId()){
  if(process.env.NPC_AI_ENABLED!=="true")return;
  let claimed:PublicConversation|undefined;
  try{
    const snapshot=await updateWorld(id,w=>{
      const item=w.conversations?.find(c=>c.modelState==="local"&&w.minute-c.minute<=20);if(!item)return w;
      const next=structuredClone(w),c=next.conversations!.find(c=>c.id===item.id)!;c.modelState="claimed";claimed=structuredClone(c);next.revision++;return next;
    });
    if(!claimed)return;
    const turns=await socialReplies(claimed,snapshot,aiConfig(),fetch,()=>reserveChatQuota(id,"model"));
    await updateWorld(id,w=>{
      const item=w.conversations?.find(c=>c.id===claimed!.id&&c.modelState==="claimed");if(!item)return w;
      const next=structuredClone(w);const c=next.conversations!.find(c=>c.id===item.id)!;c.turns=turns;c.modelState="done";next.revision++;return next;
    });
  }catch{console.info("npc_social",{source:"fallback",reason:"enrichment_unavailable"});}
}
