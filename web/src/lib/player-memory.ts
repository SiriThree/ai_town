import type { ChatTurn } from "./chat-types";

// Private, visitor-scoped evidence. Never copied to public NPC experiences.
export type PlayerEncounter = { turnId:string; minute:number; revision:number; kind:"conversation"|"introduction"; summary:string };
export type PlayerMemory = { version:1; meetings:number; familiarity:number; trust:0; affection:0; name?:string; nameSource?:string; nameFact?:{name:string;turnId:string;message:string;minute:number;revision:number}; first?:PlayerEncounter; recent:PlayerEncounter[] };
export const emptyPlayerMemory=():PlayerMemory=>({version:1,meetings:0,familiarity:0,trust:0,affection:0,recent:[]});
// Explicit self-introduction only, not quoted stories, questions or inferred identity.
export function introducedName(message:string):string|undefined {
  if(/[？?]$/.test(message.trim())&&!/[，,]\s*(?:你记住了吗|记住了吗)[？?]$/.test(message.trim()))return;
  const name=/^(?:我叫|请叫我|以后请叫我|更正一下[，,]?\s*我叫)\s*([\p{Script=Han}A-Za-z]{1,12})(?:[，,]\s*(?:你记住了吗|请记住|记住了吗|这是我的名字))?[。！!？?，,]?$/u.exec(message.trim())?.[1];
  return name&&!/^(?:你|他|她|大家|我们|什么|谁|怎么)|(?:去|到).*(?:咖啡|广场|住宅)/.test(name)?name:undefined;
}
export function rememberPlayer(memory:PlayerMemory,turn:ChatTurn):PlayerMemory {
  if(memory.first?.turnId===turn.id||memory.recent.some(e=>e.turnId===turn.id))return memory;
  const next=structuredClone(memory),name=introducedName(turn.message);
  const event:PlayerEncounter={turnId:turn.id,minute:turn.minute,revision:turn.worldRevision,kind:name?"introduction":"conversation",summary:name?`对方自报称呼「${name}」`:"与这位访客完成一次交谈"};
  next.first??=event;next.meetings++;next.familiarity=Math.min(100,next.meetings);
  if(name){next.name=name;next.nameSource=turn.id;next.nameFact={name,turnId:turn.id,message:turn.message,minute:turn.minute,revision:turn.worldRevision};}
  next.recent=[...next.recent,event].slice(-8);return next;
}
export function playerMemory(stored:PlayerMemory|null|undefined,history:ChatTurn[]):PlayerMemory {
  // Legacy records establish only what the retained turns actually prove.
  if(!stored)return history.reduce(rememberPlayer,emptyPlayerMemory());
  if(stored.nameFact)return stored;
  // Recover only retained, explicit player introductions; never mine model replies.
  const introductions=history.filter(t=>introducedName(t.message));
  const last=introductions.at(-1);
  if(!last)return stored;
  // An existing newer name must not be overwritten by older retained text.
  if(stored.nameSource&&stored.nameSource!==last.id&&!introductions.some(t=>t.id===stored.nameSource))return stored;
  const name=introducedName(last.message)!;
  return {...stored,name,nameSource:last.id,nameFact:{name,turnId:last.id,message:last.message,minute:last.minute,revision:last.worldRevision}};
}
export const asksPlayerName=(message:string)=>/我(?:的名字|叫什么)|知道我名字/.test(message);
export function recognitionReply(message:string,memory:PlayerMemory):string|undefined {
  const name=introducedName(message);if(name)return `你好，${name}，我记住这个称呼了。`;
  if(asksPlayerName(message))return memory.name?`你之前说叫${memory.name}，我记下了。`:"你还没告诉我称呼，我不能猜。";
  if(!/记得我|认识我|我们.*(?:见过|聊过)|还认得/.test(message))return;
  if(!memory.first)return "我还没有与你见面的记录，你愿意介绍一下吗？";
  return `记得${memory.name?`，${memory.name}`:""}，第${Math.floor(memory.first.minute/1440)+1}天我们聊过。`;
}
