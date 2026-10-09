import { readFile } from "node:fs/promises";
import { database } from "../src/lib/store";
const url = new URL(process.env.DATABASE_URL || "");
if (!["/ai_town_mvp", "/ai_town_mvp_test"].includes(url.pathname)) throw new Error("初始化仅允许本项目专用数据库 ai_town_mvp / ai_town_mvp_test");
try {
  await database().query(await readFile(new URL("./schema.sql",import.meta.url),"utf8"));
  console.log("项目表已就绪；未删除、重置或播种任何已有世界。");
} finally { await database().end(); }
