import { requireChatSlot, reserveChatQuota } from "./chat-limits";
import { randomUUID } from "node:crypto";
import { database, readWorld, StoreError, worldId } from "./store";
import { buildMessages, fallbackReply } from "./chat-context";
import { modelReply,aiConfig } from "./chat-model";
import {naturalChat} from './natural-chat';
import { HISTORY_TURNS, MAX_MESSAGE, type ChatTurn, type ChatReply } from "./chat-types";
import {playerMemory,rememberPlayer,introducedName,asksPlayerName,recognitionReply} from "./player-memory";
import {invitationIntent,appointmentReply} from "./appointments";
import {confirmInvitation,privateConversationState} from "./invitation-store";
import {checkChatFacts,recallRequest,recallFallback} from "./chat-facts";
import {gatheringRecall,gatheringKnowledge} from "./gatherings";

export function validateMessage(value: unknown): string {
  if (typeof value !== "string" || !value.trim() || value.length > MAX_MESSAGE || /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(value)) throw new StoreError(400, `消息必须为 1–${MAX_MESSAGE} 个字符的文本`);
  return value.trim();
}
export async function chatHistory(npcId: string, visitorId: string, id = worldId()): Promise<ChatTurn[]> {
  const w = await readWorld(id);
  if (!w.npcs.some(n => n.id === npcId)) throw new StoreError(404, "居民不存在");
  const result = await database().query("SELECT turns FROM town_private_chats WHERE world_id=$1 AND npc_id=$2 AND visitor_id=$3",[id,npcId,visitorId]);
  return result.rows[0]?.turns || [];
}
export async function chat(npcId: string, input: unknown, visitorId: string, id = worldId(),requestId:unknown=undefined): Promise<ChatTurn> {
  const message = validateMessage(input);
  if(requestId!==undefined&&(typeof requestId!=="string"||! /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(requestId)))throw new StoreError(400,"请求编号无效");
  const world = await readWorld(id);
  const npc = world.npcs.find(n => n.id === npcId);
  if (!npc) throw new StoreError(404, "居民不存在");
  const client = await database().connect();
  let locked = false;
  try {
    // Session lock only for this world's NPC, with no open transaction during model I/O.
    // Another conversation receives 409 instead of waiting/overwriting; world ticks stay independent.
    const lock = await client.query("SELECT pg_try_advisory_lock(hashtext($1),hashtext($2)) AS locked",[id,npcId]);
    locked = lock.rows[0].locked;
    if (!locked) throw new StoreError(409,"这位居民正在回复，请稍后重新打开对话查看记录。");
    const result = await client.query("SELECT turns,player_memory FROM town_private_chats WHERE world_id=$1 AND npc_id=$2 AND visitor_id=$3",[id,npcId,visitorId]);
    const history: ChatTurn[] = result.rows[0]?.turns || [];
    const memory=playerMemory(result.rows[0]?.player_memory,history);
    await requireChatSlot(id);
    const snapshot=await privateConversationState(client,id,npcId,visitorId,message);
    const config=aiConfig();let understandingFailure:ChatReply|undefined;
    if(config.enabled&&config.key.trim()&&config.baseUrl.trim()&&config.model.trim()){
      const result=await naturalChat(client,id,npcId,visitorId,message,requestId as string??randomUUID(),history,snapshot);
      if('turn' in result)return result.turn;
      understandingFailure=result.failed;
    }
    // Finite legacy phrases are now only the no-model / failed-model fallback.
    const intent=invitationIntent(message,npc.name);
    const cafeContext=snapshot.appointments.some(a=>["proposed","accepted","waiting","travelling","arrived"].includes(a.status));
    const explicitCafe=/(?:麦香)?咖啡馆/.test(message);
    if(intent==="invite"||intent==="cancel"||intent==="propose"||intent==="negotiate"||intent==="schedule"&&(explicitCafe||cafeContext))return await confirmInvitation(client,id,npcId,visitorId,message,requestId as string??randomUUID(),intent);
    if(intent==="confirm"){
      const pending=cafeContext;
      const repeated=requestId&&(await client.query("SELECT 1 FROM town_invitations WHERE world_id=$1 AND npc_id=$2 AND visitor_id=$3 AND (response->'confirmation'->>'requestId'=$4 OR response->'receipts' @> $5::jsonb)",[id,npcId,visitorId,requestId,JSON.stringify([{requestId}])])).rows.length>0;
      if(pending||repeated)return await confirmInvitation(client,id,npcId,visitorId,message,requestId as string??randomUUID(),intent);
    }
    const currentNpc=snapshot.world.npcs.find(n=>n.id===npcId)!;
    const turnId=randomUUID(),newName=introducedName(message);
    const contextMemory=newName?rememberPlayer(memory,{id:turnId,message,reply:"",source:"fallback",minute:snapshot.world.minute,worldRevision:snapshot.world.revision,createdAt:new Date().toISOString()}):memory;
    const publicRecall=gatheringRecall(currentNpc,snapshot.world,message);
    const recalling=!publicRecall&&recallRequest(message).recalling;
    const query=recallRequest(message);
    const currentStatus=intent==="status"&&query.day===null&&query.relative===null;
    const clarify=intent==="clarify"||intent==="schedule"||intent==="ambiguous";
    const statusReply=recalling&&snapshot.appointments[0]?.status==="met"?recallFallback(snapshot.recall)??appointmentReply(snapshot.appointments[0]):appointmentReply(snapshot.appointments[0]);
    const clarification=snapshot.appointments[0]?appointmentReply(snapshot.appointments[0]):intent==="schedule"||intent==="ambiguous"?"你是想约我在麦香咖啡馆见面吗？请说清地点和时间。":"你想问刚才哪一件事？可以再说具体一点吗？";
    const rawReply = currentStatus||clarify?{reply:currentStatus?statusReply:clarification,source:"fallback" as const,reason:"controlled_action" as const}:understandingFailure?{...understandingFailure,reply:(asksPlayerName(message)||/认识我|记得我/.test(message)?recognitionReply(message,contextMemory):undefined)??(recalling?recallFallback(snapshot.recall):undefined)??fallbackReply(currentNpc,snapshot.world,message,history,contextMemory)}:
      await modelReply(buildMessages(currentNpc,snapshot.world,history,message,contextMemory,snapshot.appointments,snapshot.recall), () => (asksPlayerName(message)||(/认识我|记得我/.test(message)&&!/约定|邀请|会合|咖啡/.test(message))?recognitionReply(message,contextMemory):undefined)??(recalling?recallFallback(snapshot.recall):undefined)??fallbackReply(currentNpc,snapshot.world,message,history,contextMemory), undefined, undefined, undefined, () => reserveChatQuota(id,"model"));
    let reply=checkChatFacts(rawReply,currentNpc,snapshot.world,snapshot.recall);
    // Unsupported wording must not gain execution authority through an invented model promise.
    if(rawReply.source==="ai"&&!recalling&&intent===null&&/(?:约|邀请|一起|见面|咖啡馆)/.test(message)&&/(?:说好|答应|约好|(?:广场|咖啡馆).*见|(?:等会|待会|马上|现在就).*(?:去找你|来找你|出发))/.test(rawReply.reply)){
      reply={...rawReply,reply:snapshot.appointments[0]?appointmentReply(snapshot.appointments[0]):"还没有确认约定，请说清咖啡馆和见面时间。",source:"fallback",reason:"fact_conflict",factCheck:{code:"unconfirmed_commitment",originalReply:rawReply.reply,sourceIds:snapshot.appointments.map(a=>a.id)}};
    }
    if(publicRecall&&rawReply.source==="ai"&&!gatheringKnowledge(snapshot.world,currentNpc,message).firsthandFacts.length&&/我.*(?:参加了|参加过|去了|去过|在场|到场)|我们.*(?:聚会|聊过)/.test(rawReply.reply))reply={...rawReply,reply:publicRecall,source:"fallback",reason:"fact_conflict",factCheck:{code:"public_attendance",originalReply:rawReply.reply,sourceIds:[]}};
    // A model cannot erase or invent the private explicit name fact.
    if(rawReply.source==="ai"&&(asksPlayerName(message)||!!newName)&&(!contextMemory.name||!rawReply.reply.includes(contextMemory.name)||/不知道|不记得|没告诉/.test(rawReply.reply)))reply={...rawReply,reply:recognitionReply(message,contextMemory)!,source:"fallback",reason:"fact_conflict",factCheck:{code:"player_name",originalReply:rawReply.reply,sourceIds:contextMemory.nameSource?[contextMemory.nameSource]:[]}};
    const turn: ChatTurn = {...reply,id:turnId,message,worldRevision:snapshot.world.revision,minute:snapshot.world.minute,createdAt:new Date().toISOString()};
    const turns = [...history,turn].slice(-HISTORY_TURNS);
    // One atomic write; never updates town_worlds, even if it advanced during the request.
    await client.query("INSERT INTO town_private_chats(world_id,npc_id,visitor_id,turns,player_memory) VALUES($1,$2,$3,$4,$5) ON CONFLICT(world_id,npc_id,visitor_id) DO UPDATE SET turns=EXCLUDED.turns,player_memory=EXCLUDED.player_memory,updated_at=now()",[id,npcId,visitorId,JSON.stringify(turns),JSON.stringify(rememberPlayer(memory,turn))]);
    return turn;
  } finally {
    try { if(locked) await client.query("SELECT pg_advisory_unlock(hashtext($1),hashtext($2))",[id,npcId]); }
    catch { client.release(true); locked=false; throw new StoreError(503,"对话连接已中断，请重新打开查看已保存记录。"); }
    client.release();
  }
}
