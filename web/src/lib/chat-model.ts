import { MAX_REPLY, type ChatReply, type FallbackReason } from "./chat-types";
import type { ModelMessage } from "./chat-context";
export type AIConfig = { enabled: boolean; key: string; baseUrl: string; model: string; timeoutMs: number; testMode: boolean };
export function aiConfig(): AIConfig {
  const timeout = Number(process.env.AI_TIMEOUT_MS || 8000);
  return { enabled: process.env.AI_ENABLED === "true", key: process.env.AI_API_KEY || "", baseUrl: process.env.AI_BASE_URL || "", model: process.env.AI_MODEL || "", timeoutMs: Math.max(100, Math.min(10000, Number.isFinite(timeout) ? timeout : 8000)), testMode: process.env.AI_TEST_MODE === "true" };
}
const modelSlots=globalThis as typeof globalThis & {townActiveModels?:number};
type Diagnostic = { source: "ai" | "fallback"; reason?: FallbackReason; elapsedMs: number; status?: number };
export async function modelReply(messages: ModelMessage[], fallback: () => string, config = aiConfig(), transport: typeof fetch = fetch, diagnose: (event: Diagnostic) => void = event => console.info("npc_chat", event), reserveAttempt: () => Promise<boolean> = async () => true, jsonMode = false): Promise<ChatReply> {
  const start = Date.now();
  const degrade = (reason: FallbackReason, status?: number): ChatReply => {
    diagnose({ source: "fallback", reason, elapsedMs: Date.now() - start, ...(status ? {status} : {}) });
    return { reply: fallback(), source: "fallback", reason };
  };
  if (!config.key.trim() || !config.baseUrl.trim() || !config.model.trim()) return degrade("not_configured");
  if (!config.enabled) return degrade("disabled");
  let url: URL;
  try {
    url = new URL(config.baseUrl.replace(/\/+$/, "") + "/chat/completions");
    const loopback = ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname);
    if (url.username || url.password || url.search || url.hash || (url.protocol !== "https:" && !(url.protocol === "http:" && loopback)) || (config.testMode && !loopback)) return degrade("invalid_config");
  } catch { return degrade("invalid_config"); }
  // Failed external attempts also consume quota; database errors fail closed.
  if((modelSlots.townActiveModels??0)>=2)return degrade("busy");
  modelSlots.townActiveModels=(modelSlots.townActiveModels??0)+1;
  try { if (!await reserveAttempt()){modelSlots.townActiveModels--;return degrade("budget_exhausted");} } catch(error){modelSlots.townActiveModels--;throw error;}
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.timeoutMs);
  try {
    const response = await transport(url, { method: "POST", redirect: "error", signal: controller.signal,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.key}` },
      body: JSON.stringify({ model: config.model, messages, stream: false, max_completion_tokens: 400, ...(jsonMode?{response_format:{type:"json_object"}}:{}) }),
    });
    if (!response.ok) { await response.body?.cancel(); return degrade("service_error",response.status); }
    let data;
    try { data = await response.json(); } catch (error) { if(controller.signal.aborted) throw error; return degrade("invalid_response"); }
    const content = data?.choices?.[0]?.message?.content;
    if (typeof content !== "string" || !content.trim() || content.length > MAX_REPLY || data.choices[0].message.tool_calls?.length) return degrade("invalid_response");
    diagnose({ source: "ai", elapsedMs: Date.now()-start });
    // Treat model output only as plain text. No actions or database tools are exposed.
    return { reply: content.trim(), source: "ai", ...(config.testMode ? {testMode:true} : {}) };
  } catch { return degrade(controller.signal.aborted ? "timeout" : "network"); }
  finally { clearTimeout(timer);modelSlots.townActiveModels!--; }
}
