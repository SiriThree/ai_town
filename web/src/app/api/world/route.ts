import { readWorld } from "../../../lib/store";
import { failed, json } from "../../../lib/http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET() {
  try { return json(await readWorld()); } catch (error) { return failed(error); }
}
