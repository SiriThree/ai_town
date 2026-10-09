import { database, StoreError } from "./store";

function limit(value: string | undefined, fallback: number, ceiling: number) {
  const n = Number(value);
  return value !== undefined && Number.isInteger(n) && n >= 0 ? Math.min(n, ceiling) : fallback;
}
// Two fixed rows per world, using database time and atomic UPSERT across processes/restarts.
export async function reserveChatQuota(id: string, kind: "request" | "model"): Promise<boolean> {
  const maximum = kind === "request" ? limit(process.env.CHAT_REQUESTS_PER_MINUTE, 30, 120) : limit(process.env.AI_CALLS_PER_DAY, 60, 200);
  if (maximum === 0) return false;
  const period = kind === "request" ? 60 : 86400;
  const result = await database().query(`
    INSERT INTO town_chat_limits(world_id,kind,bucket,used)
    VALUES($1,$2,floor(extract(epoch FROM clock_timestamp())/$3)::bigint,1)
    ON CONFLICT(world_id,kind) DO UPDATE SET
      bucket=GREATEST(town_chat_limits.bucket,EXCLUDED.bucket),
      used=CASE WHEN town_chat_limits.bucket>=EXCLUDED.bucket THEN town_chat_limits.used+1 ELSE 1 END
    WHERE town_chat_limits.bucket<EXCLUDED.bucket OR town_chat_limits.used<$4
    RETURNING used`, [id, kind, period, maximum]);
  return result.rowCount === 1;
}
export async function requireChatSlot(id: string) {
  if (!await reserveChatQuota(id, "request")) throw new StoreError(429, "共享小镇对话过于频繁，请一分钟后重试。未调用模型。");
}
