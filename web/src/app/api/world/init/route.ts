import { initializeWorld, StoreError } from "../../../../lib/store";
import { checkOrigin, failed, json } from "../../../../lib/http";
export const runtime = "nodejs";
export async function POST(request: Request) {
  try { checkOrigin(request); if(process.env.PUBLIC_DEMO === "true") throw new StoreError(403,"公开演示请由维护者初始化世界"); return json(await initializeWorld()); } catch (error) { return failed(error); }
}
