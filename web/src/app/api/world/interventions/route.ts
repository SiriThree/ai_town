import { feedWorld, StoreError } from "../../../../lib/store";
import { checkOrigin, failed, json, readJson } from "../../../../lib/http";
export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    checkOrigin(request);
    const body = await readJson(request) as {expectedRevision:number;action:string;npcId:string} | null;
    if (!body || body.action !== "feed" || typeof body.npcId !== "string" || !Number.isSafeInteger(body.expectedRevision) || body.expectedRevision < 0) throw new StoreError(400, "需要居民、送食物操作及有效世界版本");
    return json(await feedWorld(body.npcId, body.expectedRevision));
  } catch (error) { return failed(error); }
}
