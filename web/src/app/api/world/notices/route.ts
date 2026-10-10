import {checkOrigin,failed,json,readJson} from "../../../../lib/http";
import {visitorSession} from "../../../../lib/visitor-session";
import {worldId} from "../../../../lib/store";
import {notices,changeNotice} from "../../../../lib/notice-store";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export async function GET(req:Request){try{checkOrigin(req);const s=visitorSession(req,true),r=json(await notices(worldId(),s.id));r.headers.set("Vary","Cookie");if(s.cookie)r.headers.set("Set-Cookie",s.cookie);return r;}catch(e){return failed(e);}}
export async function POST(req:Request){try{checkOrigin(req);const s=visitorSession(req);return json(await changeNotice(worldId(),s.id,await readJson(req)));}catch(e){return failed(e);}}
