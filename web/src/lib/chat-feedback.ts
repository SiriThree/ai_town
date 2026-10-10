export type ChatPhase="ready"|"sending"|"replied"|"error";
// A private message has a UI lifecycle, not ownership of a shared-world NPC.
export function chatFeedback(name:string,phase:ChatPhase,present:boolean,available:boolean){
  if(phase==="sending")return `消息已发送，等待${name}回复 · 世界继续运行 · Esc 关闭`;
  if(!present)return `${name}已前往另一场景 · 本轮交流结束，手记已保留 · Esc 关闭`;
  if(!available)return `${name}已继续行动或离开范围 · 手记已保留 · Esc 关闭`;
  if(phase==="error")return `本次消息未确认，请核对手记 · 居民照常行动 · Esc 关闭`;
  if(phase==="replied")return `本轮回复已完成 · 居民照常行动 · Esc 关闭`;
  return `已打开与${name}的交流 · 尚未发送 · 居民照常行动 · Esc 关闭`;
}
