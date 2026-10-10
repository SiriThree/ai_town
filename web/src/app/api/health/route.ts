import { database, readWorld } from "../../../lib/store";
import { sessionConfig } from "../../../lib/visitor-session";
import { json } from "../../../lib/http";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export async function GET(request: Request) {
  try {
    sessionConfig(request);
    await readWorld();
    await database().query("SELECT player_memory FROM town_private_chats LIMIT 0");
    await database().query("SELECT 1 FROM town_invitations LIMIT 0");
    await database().query("SELECT 1 FROM town_chat_limits LIMIT 0");
    return json({ok:true,release:process.env.RELEASE_ID || "local"});
  } catch {return json({ok:false},503);}
}
