import { requireChatSlot, reserveChatQuota } from "./chat-limits";
import { randomUUID } from "node:crypto";
import { database, readWorld, StoreError, worldId } from "./store";
import { buildMessages, fallbackReply } from "./chat-context";
import { modelReply } from "./chat-model";
import { HISTORY_TURNS, MAX_MESSAGE, type ChatTurn } from "./chat-types";

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
export async function chat(npcId: string, input: unknown, visitorId: string, id = worldId()): Promise<ChatTurn> {
  const message = validateMessage(input);
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
    const result = await client.query("SELECT turns FROM town_private_chats WHERE world_id=$1 AND npc_id=$2 AND visitor_id=$3",[id,npcId,visitorId]);
    const history: ChatTurn[] = result.rows[0]?.turns || [];
    await requireChatSlot(id);
    const reply = await modelReply(buildMessages(npc,world,history,message), () => fallbackReply(npc,world,message,history), undefined, undefined, undefined, () => reserveChatQuota(id,"model"));
    const turn: ChatTurn = {...reply,id:randomUUID(),message,worldRevision:world.revision,minute:world.minute,createdAt:new Date().toISOString()};
    const turns = [...history,turn].slice(-HISTORY_TURNS);
    // One atomic write; never updates town_worlds, even if it advanced during the request.
    await client.query("INSERT INTO town_private_chats(world_id,npc_id,visitor_id,turns) VALUES($1,$2,$3,$4) ON CONFLICT(world_id,npc_id,visitor_id) DO UPDATE SET turns=EXCLUDED.turns,updated_at=now()",[id,npcId,visitorId,JSON.stringify(turns)]);
    return turn;
  } finally {
    try { if(locked) await client.query("SELECT pg_advisory_unlock(hashtext($1),hashtext($2))",[id,npcId]); }
    catch { client.release(true); locked=false; throw new StoreError(503,"对话连接已中断，请重新打开查看已保存记录。"); }
    client.release();
  }
}
