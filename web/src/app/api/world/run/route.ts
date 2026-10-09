import { setWorldRunning, StoreError } from "../../../../lib/store";
import { checkOrigin, failed, json, readJson } from "../../../../lib/http";
export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    checkOrigin(request);
    const body = await readJson(request) as {expectedRevision:number;running:boolean} | null;
    if (!body || typeof body.running !== "boolean" || !Number.isSafeInteger(body.expectedRevision) || body.expectedRevision < 0) throw new StoreError(400, "需要运行开关及有效世界版本");
    return json(await setWorldRunning(body.running, body.expectedRevision));
  } catch (error) { return failed(error); }
}
