import { StoreError } from "./store";
export const json = (data: unknown, status = 200) => Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
export function failed(error: unknown) {
  if (error instanceof StoreError) return json({ error: error.message }, error.status);
  // Never return connection strings, credentials or raw database errors.
  return json({ error: "无法读取或保存世界，请检查本项目数据库连接、表初始化与存档版本。状态未被重置。" }, 503);
}
export function checkOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return;
  // Next may normalize request.url to localhost even when the browser uses 127.0.0.1.
  // Compare the browser origin with the actual HTTP Host, including its port.
  let originHost = "";
  try { originHost = new URL(origin).host; } catch { /* Reject malformed origins below. */ }
  if (!originHost || originHost !== request.headers.get("host")) throw new StoreError(403, "不接受跨站修改请求");
}
export async function readJson(request: Request): Promise<unknown> {
  if (Number(request.headers.get("content-length")) > 4096) throw new StoreError(400,"请求过长");
  const reader=request.body?.getReader();
  if (!reader) throw new StoreError(400,"请求必须是 JSON");
  const parts: Uint8Array[]=[];let size=0;
  try {
    while (true) {
      const {done,value}=await reader.read();if(done)break;
      size+=value.byteLength;
      if(size>4096){await reader.cancel();throw new StoreError(400,"请求过长");}
      parts.push(value);
    }
  } finally {reader.releaseLock();}
  const bytes=new Uint8Array(size);let offset=0;for(const part of parts){bytes.set(part,offset);offset+=part.length;}
  try {return JSON.parse(new TextDecoder().decode(bytes));} catch {throw new StoreError(400,"请求必须是 JSON");}
}
