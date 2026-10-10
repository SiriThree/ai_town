import {checkOrigin,failed,json,readJson} from "../../../../lib/http";
import {visitorSession} from "../../../../lib/visitor-session";
import {worldId} from "../../../../lib/store";
import {notices,changeNotice,gatheringPresence} from "../../../../lib/notice-store";
import {requireChatSlot} from "../../../../lib/chat-limits";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export async function GET(req:Request){try{checkOrigin(req);const s=visitorSession(req,true),r=json(await notices(worldId(),s.id));r.headers.set("Vary","Cookie");if(s.cookie)r.headers.set("Set-Cookie",s.cookie);return r;}catch(e){return failed(e);}}
export async function POST(req:Request){try{checkOrigin(req);const s=visitorSession(req),body=await readJson(req);if((body as {action?:string})?.action==="presence"){await requireChatSlot(worldId());return json(await gatheringPresence(worldId(),s.id,(body as {presence?:unknown}).presence));}return json(await changeNotice(worldId(),s.id,body));}catch(e){return failed(e);}}
