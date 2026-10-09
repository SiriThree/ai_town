import {after} from "next/server";
import {enrichSocial} from "../../../../lib/social-service";
import { wakeWorld } from "../../../../lib/store";
import { checkOrigin, failed, json } from "../../../../lib/http";
export const runtime = "nodejs";
export async function POST(request: Request) {
  try { checkOrigin(request); const w=await wakeWorld();after(()=>enrichSocial());return json(w); }
  catch (error) { return failed(error); }
}
