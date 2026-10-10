"use client";
import { useEffect, useRef, useState } from "react";
import { FALLBACK_LABELS, MAX_MESSAGE, type ChatTurn } from "../lib/chat-types";
import { worldTime, type Npc } from "../lib/world";
import type {ChatPhase} from "../lib/chat-feedback";
import {appointmentReply,type Appointment} from "../lib/appointments";
import type {Player} from "../lib/player-scene";

const appointmentForMeeting=(appointments:Appointment[])=>appointments.find(a=>a.status==="arrived"&&a.scheduledMinute!==undefined)?.id;

export default function SceneChat({ getPlayer,diagnostics=false,npc, available, onClose, onReply, onProfile, historyOpen, onHistory,onPhaseChange }: {getPlayer:()=>Player|null;diagnostics?:boolean; onPhaseChange:(phase:ChatPhase)=>void; available:boolean; npc: Npc; onClose: () => void; onReply: (turn: ChatTurn | null) => void; onProfile: () => void; historyOpen: boolean; onHistory: (open: boolean) => void }) {
  const replyCallback = useRef(onReply);
  useEffect(() => { replyCallback.current = onReply; }, [onReply]);
  const list = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const alive = useRef(false);
  const sending = useRef(false);
  const attempt=useRef<{message:string;id:string}|null>(null);
  const [turns,setTurns] = useState<ChatTurn[]>([]);
  const [appointments,setAppointments]=useState<Appointment[]>([]);
  const [draft,setDraft] = useState("");
  const [loading,setLoading] = useState(true);
  const [pending,setPending] = useState(false);
  const [error,setError] = useState("");
  const [replied,setReplied]=useState(false);
  useEffect(()=>onPhaseChange(pending?"sending":error?"error":replied?"replied":"ready"),[pending,error,replied,onPhaseChange]);
  const endpoint = `/api/npcs/${npc.id}/chat`;
  useEffect(() => {
    alive.current = true;
    replyCallback.current(null);
    const controller = new AbortController();
    fetch(endpoint,{cache:"no-store",signal:AbortSignal.any([controller.signal,AbortSignal.timeout(10000)])})
      .then(async r => { const data=await r.json(); if(!r.ok) throw new Error(data.error); return data; })
      .then(data => {if(!controller.signal.aborted) {setTurns(data.turns);setAppointments(data.appointments??[]);replyCallback.current(data.turns.at(-1) ?? null);}})
      .catch(() => {if(!controller.signal.aborted) setError("对话记录读取失败，请重读后再发送。");})
      .finally(() => {if(!controller.signal.aborted) {setLoading(false);input.current?.focus();}});
    return () => {alive.current=false;controller.abort();};
  },[endpoint]);
  useEffect(()=>{
    // The first GET establishes the signed visitor cookie. A parallel initial GET
    // could otherwise mint a second identity and race the first introduction POST.
    if(loading)return;
    const controller=new AbortController();
    fetch(endpoint,{cache:"no-store",signal:controller.signal}).then(async r=>r.ok?r.json():null).then(data=>{if(data&&!controller.signal.aborted)setAppointments(data.appointments??[]);}).catch(()=>{});
    return()=>controller.abort();
  },[endpoint,npc.appointment?.status,npc.appointment?.id,loading]);
  useEffect(()=>{
    if(!available||!appointmentForMeeting(appointments)||appointmentForMeeting(appointments)!==npc.appointment?.id)return;
    const presence=getPlayer();if(presence?.sceneId!=="cafe_interior")return;
    let active=true;
    fetch(endpoint,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({interaction:"meet",presence}),signal:AbortSignal.timeout(10000)})
      .then(async r=>r.ok?r.json():null).then(data=>{if(active&&data?.meeting)setAppointments(list=>list.map(a=>a.id===data.meeting.id?data.meeting:a));}).catch(()=>{});
    return()=>{active=false;};
  },[endpoint,available,appointments,npc.appointment?.id,getPlayer]);
  useEffect(() => {list.current?.scrollTo({top:list.current.scrollHeight});},[turns,pending,historyOpen]);
  async function readHistory() {
    const response=await fetch(endpoint,{cache:"no-store",signal:AbortSignal.timeout(10000)});
    const data=await response.json();
    if(!response.ok) throw new Error(data.error);
    if(alive.current) {setTurns(data.turns);setAppointments(data.appointments??[]);replyCallback.current(data.turns.at(-1) ?? null);}
  }
  async function reload() {
    if(sending.current) return;
    setLoading(true);setError("");
    try {await readHistory();} catch {if(alive.current)setError("对话记录读取失败，请稍后再试。");}
    finally {if(alive.current)setLoading(false);}
  }
  async function send(confirmed?:string) {
    const message=confirmed??draft.trim();
    if(!available||!message||sending.current||loading||error) return;
    sending.current=true;setPending(true);setError("");
    if(confirmed)setDraft(confirmed);
    if(attempt.current?.message!==message)attempt.current={message,id:crypto.randomUUID()};
    try {
      const response=await fetch(endpoint,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({message,requestId:attempt.current.id}),signal:AbortSignal.timeout(25000)});
      const data=await response.json();
      if(!response.ok) throw new Error(data.error || "对话发送失败");
      attempt.current=null;
      if(alive.current){setTurns(previous=>[...previous,data].slice(-20));setDraft("");setReplied(true);replyCallback.current(data);}
      if(data.reason==="controlled_action")await readHistory();
    } catch(e) {
      try {await readHistory();} catch { /* Retain the last confirmed history. */ }
      if(alive.current) setError(`${e instanceof Error && e.name !== "TypeError" && e.name !== "TimeoutError" ? e.message : "对话连接中断"}。请核对记录；未自动重发。`);
    } finally {sending.current=false;if(alive.current){setPending(false);input.current?.focus();}}
  }
  const latest = turns.at(-1);
  const appointment=appointments[0];
  const meeting=appointment&&`${npc.name}：${appointmentReply(appointment)}`;
  return <section className="paper scene-composer" data-testid="scene-composer" aria-label={`与${npc.name}对话`} onKeyDown={e=>e.stopPropagation()} onPointerDown={e=>e.stopPropagation()} onWheel={e=>e.stopPropagation()}>
    <div className="composer-heading"><div className="composer-name"><span className={`resident-dot ${npc.id}`} aria-hidden /><strong>{npc.name}</strong></div><nav aria-label="对话操作"><button onClick={onProfile}>居民档案</button><button onClick={()=>onHistory(!historyOpen)} aria-expanded={historyOpen}>查看历史</button><button aria-label="关闭对话" onClick={onClose}>告别 ×</button></nav></div>
    {historyOpen && <aside className="chat-history" aria-label={`${npc.name}的对话历史`}><div className="panel-heading"><strong>与{npc.name}的手记 · 最近 20 轮</strong><button aria-label="关闭历史" onClick={()=>onHistory(false)}>×</button></div><div className="chat-messages" ref={list}>
      {!turns.length && <p className="muted">还没有已保存的对话。</p>}
      {turns.map(t=><article key={t.id} className="chat-turn" data-testid="chat-turn"><div className="chat-player"><small>你</small><p>{t.message}</p></div><div className="chat-npc"><div className="reply-heading"><strong>{npc.name}</strong>{diagnostics&&<span className={`source-badge ${t.source}`}>{t.source==="ai"?(t.testMode?"AI · 本地测试替身":"AI 回复"):`降级回复 · ${FALLBACK_LABELS[t.reason!] || "本地规则"}`}</span>}</div><p>{t.reply}</p><small className="reply-time">{worldTime(t.minute)}{diagnostics&&` · v${t.worldRevision} · ${t.id}`}</small></div></article>)}
    </div></aside>}
    <div className="composer-status" aria-live="polite" aria-busy={pending||loading}>
      {loading ? <p>正在翻开之前的对话…</p> : pending ? <p className="chat-wait" role="status">你：{draft.slice(0,60)}<span> · 已发送，{npc.name}正在想一想…</span></p> : latest ? <p className="player-preview" title={latest.message}><strong>你：</strong>{latest.message}</p> : <p>向{npc.name}打个招呼吧。</p>}
    </div>
    {diagnostics&&<p className="composer-hint" data-testid="chat-live-action" data-action-id={npc.ongoing?.id}>居民当前：{npc.action}{npc.ongoing&&` · ${Math.floor(npc.ongoing.elapsedMs/1000)}/${Math.ceil(npc.ongoing.durationMs/1000)} 秒`}（来自世界存档，打开手记不会暂停行动）</p>}
    {!available&&<p className="chat-error">居民正在忙，等靠近且空闲时再聊吧。</p>}
    {error && <div className="chat-error" role="alert"><p>{error}</p><button onClick={reload} disabled={pending||loading}>重读记录</button></div>}
    <form onSubmit={e=>{e.preventDefault();void send();}}>
      <label className="sr-only" htmlFor="chat-message">想对{npc.name}说些什么？</label>
      <textarea ref={input} id="chat-message" rows={1} placeholder="你现在在干什么？" value={draft} maxLength={MAX_MESSAGE} disabled={loading||pending} onChange={e=>setDraft(e.target.value)} onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey&&!e.nativeEvent.isComposing){e.preventDefault();void send();}}} />
      <button className="advance" type="submit" disabled={!available||pending||loading||!draft.trim()||!!error}>{pending?"等待回复…":"发送消息"}</button>
    </form>
    {meeting&&<p className="meeting-feedback" data-testid="meeting-feedback" aria-live="polite">{meeting}</p>}
    {appointment?.status==="proposed"&&<button disabled={!available||pending||loading||!!error} onClick={()=>void send("确认这个时间")}>确认这个时间</button>}
    {diagnostics&&<div className="composer-hint"><small>{draft.length}/{MAX_MESSAGE} · Enter 发送 / Shift+Enter 换行</small><small>访客私聊 · 后台确认约定后才执行</small></div>}
  </section>;
}
