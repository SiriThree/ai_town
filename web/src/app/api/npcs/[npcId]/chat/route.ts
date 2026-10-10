import { chat, chatHistory } from "../../../../../lib/chat-service";
import { checkOrigin, failed, json, readJson } from "../../../../../lib/http";
import { visitorSession } from "../../../../../lib/visitor-session";
import {privateAppointments} from "../../../../../lib/invitation-store";
import {worldId} from "../../../../../lib/store";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{npcId:string}> };
export async function GET(request: Request, context: Context) {
  try {
    checkOrigin(request);
    const session=visitorSession(request,true);
    const npcId=(await context.params).npcId;
    const response=json({turns:await chatHistory(npcId,session.id),appointments:await privateAppointments(worldId(),npcId,session.id)});
    response.headers.set("Vary","Cookie");
    if(session.cookie)response.headers.set("Set-Cookie",session.cookie);
    return response;
  } catch(error) { return failed(error); }
}
export async function POST(request: Request, context: Context) {
  try {
    checkOrigin(request);
    const body = await readJson(request) as {message?:unknown;requestId?:unknown} | null;
    const session=visitorSession(request);
    return json(await chat((await context.params).npcId,body?.message,session.id,worldId(),body?.requestId));
  } catch(error) { return failed(error); }
}
