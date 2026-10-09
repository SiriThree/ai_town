import { database, initializeWorld } from "../src/lib/store";
// Explicit maintenance command. Reuses the application seed; never resets existing saves.
const url = new URL(process.env.DATABASE_URL || "");
if (!["/ai_town_mvp", "/ai_town_mvp_test"].includes(url.pathname)) throw new Error("仅允许本项目专用数据库");
try { const world = await initializeWorld(); console.log(`世界已就绪，保留存档版本 ${world.revision}`); }
finally { await database().end(); }
