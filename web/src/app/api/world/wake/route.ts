import { wakeWorld } from "../../../../lib/store";
import { checkOrigin, failed, json } from "../../../../lib/http";
export const runtime = "nodejs";
export async function POST(request: Request) {
  try { checkOrigin(request); return json(await wakeWorld()); }
  catch (error) { return failed(error); }
}
