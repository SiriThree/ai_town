import {after} from "next/server";
import {enrichSocial} from "../../../../lib/social-service";
import { StoreError, tickWorld } from "../../../../lib/store";
import { checkOrigin, failed, json, readJson } from "../../../../lib/http";
export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    checkOrigin(request);
    const body = await readJson(request) as {expectedRevision:number} | null;
    if (!body || !Number.isSafeInteger(body.expectedRevision) || body.expectedRevision < 0) throw new StoreError(400, "缺少有效的世界版本");
    const w=await tickWorld(body.expectedRevision);after(()=>enrichSocial());return json(w);
  } catch (error) { return failed(error); }
}
