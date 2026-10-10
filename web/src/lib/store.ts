import { Pool } from "pg";
import { populateResidents, advanceOnClock, restoreWorld, assertWorld, createWorld, giveFood, runState, AUTO_INTERVAL_MS, type World } from "./world";

const globals = globalThis as typeof globalThis & { townPool?: Pool };
export function database(): Pool {
  if (!process.env.DATABASE_URL) throw new Error("本项目未配置 DATABASE_URL");
  if (!globals.townPool) globals.townPool = new Pool({ connectionString: process.env.DATABASE_URL, max: 5, connectionTimeoutMillis: 3000, statement_timeout: 5000, idle_in_transaction_session_timeout: 5000 });
  return globals.townPool;
}
export const worldId = () => process.env.WORLD_ID || "morning-town";
export class StoreError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
function decode(payload: unknown): World { return restoreWorld(payload); }
export async function readWorld(id = worldId()): Promise<World> {
  const result = await database().query("SELECT payload FROM town_worlds WHERE id = $1", [id]);
  if (!result.rows.length) throw new StoreError(404, "世界尚未初始化");
  return decode(result.rows[0].payload);
}
export async function initializeWorld(id = worldId()): Promise<World> {
  const seed=process.env.WORLD_ROSTER==="legacy"?createWorld():{...populateResidents(createWorld()),revision:0};
  await database().query("INSERT INTO town_worlds(id, revision, payload) VALUES($1, 0, $2) ON CONFLICT (id) DO NOTHING", [id, JSON.stringify(seed)]);
  return readWorld(id);
}
export async function tickWorld(expectedRevision: number, id = worldId()): Promise<World> {
  return updateWorld(id, (current, now) => {
    checkRevision(current, expectedRevision);
    return advanceOnClock(current, now, false);
  });
}
function checkRevision(world: World, expected: number) {
  if (world.revision !== expected) throw new StoreError(409, "世界已被推进或更新，已重新读取最新状态；请确认后再操作。");
}
export async function feedWorld(npcId: string, expectedRevision: number, id = worldId()): Promise<World> {
  return updateWorld(id, current => {
    const npc = current.npcs.find(n => n.id === npcId);
    if (!npc) throw new StoreError(404, "居民不存在");
    checkRevision(current, expectedRevision);
    if (npc.hunger <= 0) throw new StoreError(409, "居民已经吃饱了，暂不需要食物。");
    return giveFood(current, npcId);
  });
}
export async function wakeWorld(id = worldId()): Promise<World> {
  return updateWorld(id, (current, now) => advanceOnClock(current, now, true));
}
export async function setWorldRunning(running: boolean, expectedRevision: number, id = worldId()): Promise<World> {
  return updateWorld(id, (current, now) => {
    // Pause always applies to the latest locked state, even if another tab just ticked.
    // Starting uses CAS so a delayed start cannot undo a later successful pause.
    if (running) checkRevision(current, expectedRevision);
    if (running && runState(current).running) return current;
    return { ...current, revision: current.revision + 1, run: { running, nextTickAt: running ? now + AUTO_INTERVAL_MS : null } };
  });
}
// A single short transaction serializes every world mutation. No model I/O runs here.
export async function updateWorld(id: string, change: (current: World, now: number) => World): Promise<World> {
  const client = await database().connect();
  try {
    await client.query("BEGIN");
    const result = await client.query("SELECT revision, payload FROM town_worlds WHERE id = $1 FOR UPDATE", [id]);
    if (!result.rows.length) throw new StoreError(404, "世界尚未初始化");
    const row = result.rows[0];
    const current = decode(row.payload);
    if (current.revision !== row.revision) throw new Error("存档版本不一致");
    // clock_timestamp is sampled AFTER acquiring the row lock; now() is transaction-start time.
    const time = await client.query("SELECT floor(extract(epoch FROM clock_timestamp()) * 1000)::bigint AS ms");
    const next = change(current, Number(time.rows[0].ms));
    assertWorld(next);
    if (next !== current) await client.query("UPDATE town_worlds SET revision = $2, payload = $3, updated_at = now() WHERE id = $1", [id, next.revision, JSON.stringify(next)]);
    // Private owner association remains outside the public world. Results settle atomically.
    for(const n of next.npcs)if(n.appointment&&JSON.stringify(n.appointment)!==JSON.stringify(current.npcs.find(old=>old.id===n.id)?.appointment))
      await client.query("UPDATE town_invitations SET payload=$2,updated_at=now() WHERE world_id=$3 AND id=$1",[n.appointment.id,JSON.stringify(n.appointment),id]);
    await client.query("COMMIT");
    return next;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally { client.release(); }
}

// Explicit idempotent roster migration, using the same row-lock transaction as all mutations.
export async function migrateResidents(id=worldId()):Promise<World>{return updateWorld(id,current=>populateResidents(current));}
