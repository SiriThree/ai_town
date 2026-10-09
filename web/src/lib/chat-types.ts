export const MAX_MESSAGE = 500;
export const MAX_REPLY = 4000;
export const HISTORY_TURNS = 20;
export type FallbackReason = "not_configured" | "disabled" | "invalid_config" | "timeout" | "network" | "service_error" | "invalid_response" | "budget_exhausted";
export const FALLBACK_LABELS: Record<FallbackReason, string> = {
  budget_exhausted: "今日模型额度已用完",
  not_configured: "未配置模型", disabled: "未启用模型", invalid_config: "模型配置不可用",
  timeout: "模型响应超时", network: "模型连接失败", service_error: "模型服务暂不可用", invalid_response: "模型回复无效",
};
export type ChatReply = { reply: string; source: "ai" | "fallback"; reason?: FallbackReason; testMode?: boolean };
export type ChatTurn = ChatReply & { id: string; message: string; worldRevision: number; minute: number; createdAt: string };
