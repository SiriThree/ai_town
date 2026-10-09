"use client";
import { useEffect, useRef, useState } from "react";
import { FALLBACK_LABELS, MAX_MESSAGE, type ChatTurn } from "../lib/chat-types";
import { worldTime, type Npc } from "../lib/world";

export default function SceneChat({ npc, available, onClose, onReply, onProfile, historyOpen, onHistory }: { available:boolean; npc: Npc; onClose: () => void; onReply: (turn: ChatTurn | null) => void; onProfile: () => void; historyOpen: boolean; onHistory: (open: boolean) => void }) {
  const replyCallback = useRef(onReply);
  useEffect(() => { replyCallback.current = onReply; }, [onReply]);
  const list = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const alive = useRef(false);
  const sending = useRef(false);
  const [turns,setTurns] = useState<ChatTurn[]>([]);
  const [draft,setDraft] = useState("");
  const [loading,setLoading] = useState(true);
  const [pending,setPending] = useState(false);
  const [error,setError] = useState("");
  const endpoint = `/api/npcs/${npc.id}/chat`;
  useEffect(() => {
    alive.current = true;
    replyCallback.current(null);
    const controller = new AbortController();
    fetch(endpoint,{cache:"no-store",signal:AbortSignal.any([controller.signal,AbortSignal.timeout(10000)])})
      .then(async r => { const data=await r.json(); if(!r.ok) throw new Error(data.error); return data.turns; })
      .then(data => {if(!controller.signal.aborted) {setTurns(data);replyCallback.current(data.at(-1) ?? null);}})
      .catch(() => {if(!controller.signal.aborted) setError("对话记录读取失败，请重读后再发送。");})
      .finally(() => {if(!controller.signal.aborted) {setLoading(false);input.current?.focus();}});
    return () => {alive.current=false;controller.abort();};
  },[endpoint]);
  useEffect(() => {list.current?.scrollTo({top:list.current.scrollHeight});},[turns,pending,historyOpen]);
  async function readHistory() {
    const response=await fetch(endpoint,{cache:"no-store",signal:AbortSignal.timeout(10000)});
    const data=await response.json();
    if(!response.ok) throw new Error(data.error);
    if(alive.current) {setTurns(data.turns);replyCallback.current(data.turns.at(-1) ?? null);}
  }
  async function reload() {
    if(sending.current) return;
    setLoading(true);setError("");
    try {await readHistory();} catch {if(alive.current)setError("对话记录读取失败，请稍后再试。");}
    finally {if(alive.current)setLoading(false);}
  }
  async function send() {
    const message=draft.trim();
    if(!available||!message||sending.current||loading||error) return;
    sending.current=true;setPending(true);setError("");
    try {
      const response=await fetch(endpoint,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({message}),signal:AbortSignal.timeout(25000)});
      const data=await response.json();
      if(!response.ok) throw new Error(data.error || "对话发送失败");
      if(alive.current){setTurns(previous=>[...previous,data].slice(-20));setDraft("");replyCallback.current(data);}
    } catch(e) {
      try {await readHistory();} catch { /* Retain the last confirmed history. */ }
      if(alive.current) setError(`${e instanceof Error && e.name !== "TypeError" && e.name !== "TimeoutError" ? e.message : "对话连接中断"}。请核对记录；未自动重发。`);
    } finally {sending.current=false;if(alive.current){setPending(false);input.current?.focus();}}
  }
  const latest = turns.at(-1);
  return <section className="paper scene-composer" data-testid="scene-composer" aria-label={`与${npc.name}对话`} onKeyDown={e=>e.stopPropagation()} onPointerDown={e=>e.stopPropagation()} onWheel={e=>e.stopPropagation()}>
    <div className="composer-heading"><div className="composer-name"><span className={`resident-dot ${npc.id}`} aria-hidden /><strong>{npc.name}</strong><small>街角会话</small></div><nav aria-label="对话操作"><button onClick={onProfile}>居民档案</button><button onClick={()=>onHistory(!historyOpen)} aria-expanded={historyOpen}>查看历史</button><button aria-label="关闭对话" onClick={onClose}>结束对话 ×</button></nav></div>
    {historyOpen && <aside className="chat-history" aria-label={`${npc.name}的对话历史`}><div className="panel-heading"><strong>与{npc.name}的手记 · 最近 20 轮</strong><button aria-label="关闭历史" onClick={()=>onHistory(false)}>×</button></div><div className="chat-messages" ref={list}>
      {!turns.length && <p className="muted">还没有已保存的对话。</p>}
      {turns.map(t=><article key={t.id} className="chat-turn" data-testid="chat-turn"><div className="chat-player"><small>你</small><p>{t.message}</p></div><div className="chat-npc"><div className="reply-heading"><strong>{npc.name}</strong><span className={`source-badge ${t.source}`}>{t.source==="ai"?(t.testMode?"AI · 本地测试替身":"AI 回复"):`降级回复 · ${FALLBACK_LABELS[t.reason!] || "本地规则"}`}</span></div><p>{t.reply}</p><small className="reply-time">{worldTime(t.minute)} · 按发送时的状态回答</small></div></article>)}
    </div></aside>}
    <div className="composer-status" aria-live="polite" aria-busy={pending||loading}>
      {loading ? <p>正在翻开之前的对话…</p> : pending ? <p className="chat-wait" role="status">你：{draft.slice(0,60)}<span> · 已发送，{npc.name}正在想一想…</span></p> : latest ? <p className="player-preview" title={latest.message}><strong>你：</strong>{latest.message}<small> · 回复见角色头顶；镜头外可查看历史</small></p> : <p>向{npc.name}打个招呼吧。回复会出现在角色头顶。</p>}
    </div>
    {!available&&<p className="chat-error">居民已离开交谈范围或正在忙碌；本次已发送消息仍会保存，靠近空闲居民后可继续。</p>}
    {error && <div className="chat-error" role="alert"><p>{error}</p><button onClick={reload} disabled={pending||loading}>重读记录</button></div>}
    <form onSubmit={e=>{e.preventDefault();void send();}}>
      <label className="sr-only" htmlFor="chat-message">想对{npc.name}说些什么？</label>
      <textarea ref={input} id="chat-message" rows={1} placeholder="你现在在干什么？" value={draft} maxLength={MAX_MESSAGE} disabled={loading||pending} onChange={e=>setDraft(e.target.value)} onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey&&!e.nativeEvent.isComposing){e.preventDefault();void send();}}} />
      <button className="advance" type="submit" disabled={!available||pending||loading||!draft.trim()||!!error}>{pending?"等待回复…":"发送消息"}</button>
    </form>
    <div className="composer-hint"><small>{draft.length}/{MAX_MESSAGE} · Enter 发送 / Shift+Enter 换行</small><small>本浏览器私聊 · 请勿输入敏感信息 · 打算不会改变世界</small></div>
  </section>;
}
