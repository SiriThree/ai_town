import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { StoreError } from "./store";

const MAX_AGE = 30 * 86400;
const LOCAL_SECRET = "local-only-session-key-never-use-on-a-public-host";
export function sessionConfig(request: Request) {
  const secure = process.env.PUBLIC_DEMO === "true";
  const hostname = new URL(request.url).hostname;
  const local = ["localhost","127.0.0.1","[::1]"].includes(hostname) && /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(request.headers.get("host") || "");
  const secret = process.env.COOKIE_SIGNING_SECRET || (!secure && local ? LOCAL_SECRET : "");
  if (Buffer.byteLength(secret) < 32 || secret.startsWith("REPLACE_") || (secure && secret === LOCAL_SECRET)) throw new StoreError(503,"访客会话尚未安全配置");
  return {secret, secure, name: secure ? "__Host-town_session" : "town_session"};
}
function signature(payload: string, secret: string) { return createHmac("sha256",secret).update(payload).digest("base64url"); }
export function verifySession(token: string, secret: string, now = Date.now()): string | null {
  const parts=token.split(".");
  if(parts.length!==3 || !/^[a-f0-9]{64}$/.test(parts[0]) || !/^\d{10}$/.test(parts[1]) || !/^[\w-]{43}$/.test(parts[2]))return null;
  const expires=Number(parts[1]),seconds=Math.floor(now/1000);
  if(expires<=seconds || expires>seconds+MAX_AGE)return null;
  const expected=Buffer.from(signature(`${parts[0]}.${parts[1]}`,secret));
  const actual=Buffer.from(parts[2]);
  return actual.length===expected.length && timingSafeEqual(actual,expected) ? parts[0] : null;
}
export function visitorSession(request: Request, create = false) {
  const config=sessionConfig(request);
  const values=(request.headers.get("cookie")||"").split(";").map(s=>s.trim()).filter(s=>s.startsWith(config.name+"="));
  const id=values.length===1 ? verifySession(values[0].slice(config.name.length+1),config.secret) : null;
  if(id)return {id,cookie:null};
  if(!create)throw new StoreError(401,"会话缺失或已失效，请重新打开对话后再发送");
  const fresh=randomBytes(32).toString("hex"),payload=`${fresh}.${Math.floor(Date.now()/1000)+MAX_AGE}`;
  return {id:fresh,cookie:`${config.name}=${payload}.${signature(payload,config.secret)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${MAX_AGE}${config.secure?"; Secure":""}`};
}
