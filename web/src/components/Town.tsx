"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import TownScene from "./TownScene";
import SceneChat from "./ChatDialog";
import { SCENES, type SceneId } from "../lib/player-scene";
import type { ChatTurn } from "../lib/chat-types";
import {npcPlace, runState, FOOD_AMOUNT, worldTime, type World } from "../lib/world";

async function request(path: string, body?: object) {
  const response = await fetch(path, {
    method: body ? "POST" : "GET", cache: "no-store", signal: AbortSignal.timeout(12000),
    ...(body ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {}),
  });
  const value = await response.json();
  return { response, value };
}
async function load(): Promise<World> {
  let result = await request("/api/world");
  if (result.response.status === 404) result = await request("/api/world/init", {});
  if (!result.response.ok) throw new Error(result.value.error || "读取失败，请稍后重试。");
  return result.value;
}
export default function Town() {
  const [sceneId,setSceneId]=useState<SceneId>("town");
  const [world, setWorld] = useState<World | null>(null);
  const current = useRef<World | null>(null);
  const commit = useCallback((next: World) => {
    if (!current.current || next.revision >= current.current.revision) {
      current.current = next; setWorld(next);
    }
  }, []);
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState("");
  const [foodFeedback, setFoodFeedback] = useState<{npcId:string;text:string}|null>(null);
  const [selected, setSelected] = useState("");
  const [panel, setPanel] = useState<"profile" | "log" | null>(null);
  const [chatOpen, setChatOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [speech, setSpeech] = useState<{ npcId: string; turn: ChatTurn } | null>(null);
  const [pending, setPending] = useState(true);
  const [message, setMessage] = useState("正在读取小镇存档…");
  const [error, setError] = useState("");
  const lock = useRef(false);
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    let active = true;
    const syncSelection = () => {
      const id = new URL(location.href).searchParams.get("npc");
      const valid = id === "aqing" || id === "aning";
      setSelected(valid ? id : "");
      setPanel(null); setChatOpen(valid); setSpeech(null); setHistoryOpen(false);
    };
    window.addEventListener("popstate", syncSelection);
    load().then(w => { if (active) { commit(w); syncSelection(); setMessage("存档已读取 · 规则驱动，等待你推进"); } })
      .catch(e => { if (active) setError(e instanceof Error ? e.message : "读取失败"); })
      .finally(() => { if (active) setPending(false); });
    return () => { active = false; window.removeEventListener("popstate", syncSelection); };
  }, [commit]);
  useEffect(() => { if (panel === "log") dialog.current?.showModal(); else dialog.current?.close(); }, [panel]);
  const select = (id: string) => {
    setSelected(id); setPanel(null); setChatOpen(true); setHistoryOpen(false); if(id !== selected) setSpeech(null);
    const url = new URL(location.href); url.searchParams.set("npc", id);
    history.replaceState(null, "", url);
  };
  const hasWorld = !!world;
  useEffect(() => {
    if (!hasWorld) return;
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      if (!active) return;
      const waking = current.current && runState(current.current).running;
      if (lock.current) {timer=setTimeout(poll,1000);return;}
      if (waking) {lock.current=true;setSyncing(true);}
      try {
        const {response,value}=await request(waking?"/api/world/wake":"/api/world",waking?{}:undefined);
        if(!response.ok) throw new Error("世界同步失败，请检查连接。运行状态尚未确认。");
        if(active){commit(value);setSyncError("");}
      } catch {if(active)setSyncError("世界同步失败；显示最近存档，运行状态尚未确认。");}
      finally {
        if(waking){lock.current=false;if(active)setSyncing(false);}
        if(active)timer=setTimeout(poll,1000);
      }
    }
    timer=setTimeout(poll,1000);
    return ()=>{active=false;clearTimeout(timer);};
  },[hasWorld,commit]);
  async function update(path:string, body:object, success:(saved:World)=>string) {
    if (!current.current || lock.current) return;
    lock.current = true; setPending(true); setError(""); setMessage("正在校验并保存…");
    try {
      const { response, value } = await request(path, body);
      if (!response.ok) throw new Error(value.error || "操作未完成");
      commit(value); setMessage(success(value));
    } catch (e) {
      // A lost response may follow a successful commit. Re-read; never replay an intervention.
      try { commit(await load()); } catch { /* Keep the last known committed state visible. */ }
      setError(e instanceof Error ? e.message : "连接中断，请重新读取存档"); setMessage("未自动重试；请核对当前存档后再操作");
    } finally { lock.current = false; setPending(false); }
  }
  function advance() {
    if(world) void update("/api/world/tick",{expectedRevision:world.revision},()=>"推进已保存 · +10 分钟");
  }
  function toggleRun() {
    if(world){const running=!runState(world).running;void update("/api/world/run",{running,expectedRevision:world.revision},()=>running?"自动运行已开启 · 每 5 秒一步":"已暂停 · 不再自动推进");}
  }
  function feed() {
    const target=world?.npcs.find(n=>n.id===selected);
    if(!world||!target)return;
    const before=target.hunger;
    setFoodFeedback(null);
    void update("/api/world/interventions",{action:"feed",npcId:target.id,expectedRevision:world.revision},saved=>{
      const after=saved.npcs.find(n=>n.id===target.id)!.hunger;
      const text=`已保存：${target.name}饥饿 ${before} → ${after} · 下一步由居民自行决定`;
      setFoodFeedback({npcId:target.id,text});return text;
    });
  }
  async function reload() {
    if(lock.current) return;
    lock.current=true; setPending(true); setError("");
    try { commit(await load()); setMessage("已重新读取存档"); } catch(e) { setError(e instanceof Error ? e.message : "读取失败"); }
    finally { lock.current=false; setPending(false); }
  }
  const npc = world?.npcs.find(n => n.id === selected);
  const present=npc?.sceneId===sceneId;
  return <main>
    <header className="town-header">
      <div className="brand"><span className="brand-mark" aria-hidden>✦</span><div><h1>晨露村</h1><p>小镇手记 <span> / </span> 第一章</p></div></div>
      <div className="clock"><span className="sun" aria-hidden>☀</span><div><strong data-testid="world-time">{world ? worldTime(world.minute) : "等待存档"}</strong><small data-testid="run-status">{world && runState(world).running ? "自动运行 · 每 5 秒一步" : "已暂停 · 可手动推进"}</small></div></div>
      <button className="run-toggle" aria-pressed={!!world && runState(world).running} disabled={pending || syncing || !world} onClick={toggleRun}>{world && runState(world).running ? "暂停自动运行" : "开始自动运行"}</button>
      <button className="advance" disabled={pending || syncing || !world} onClick={advance}>{pending ? "处理中…" : "推进一步"}<span aria-hidden> ▷</span></button>
    </header>
    <div className="status-line"><p role="status">{error || syncError || message}</p><span>网页打开时自动推进 · 无离线补算</span>{error && <button disabled={pending} onClick={reload}>重新读取</button>}</div>
    {world ? <>
      <section className={`scene-frame ${sceneId!=="town"?"interior":""}`}>
        <TownScene controlsBlocked={panel!==null||(historyOpen&&!!present)} onSceneChange={setSceneId} world={world} selected={selected} onSelect={select} speech={chatOpen && speech?.npcId===selected ? speech.turn : null} onExpand={()=>setHistoryOpen(true)} />
        <div className="interaction-dock" hidden={!present}>
        {npc && <div className="resident-care" aria-label="居民干预" onPointerDown={e=>e.stopPropagation()} onKeyDown={e=>e.stopPropagation()}>
          <div><strong>{npc.name}</strong><span>⌖ {npcPlace(npc,world)}</span><span>饥饿 <b data-testid="care-hunger">{npc.hunger}</b>/100</span></div>
          <button disabled={pending||syncing||npc.hunger<=0} onClick={feed}>送食物 <small>饥饿 −{FOOD_AMOUNT}</small></button>
          <p data-testid="food-feedback">{foodFeedback?.npcId===npc.id?foodFeedback.text:npc.hunger<=0?"已经吃饱，暂不需要食物。":"提供食物不会改变地点或直接指定下一步行动。"}</p>
        </div>}
        {chatOpen && npc && <SceneChat key={npc.id} npc={npc} onClose={()=>{setChatOpen(false);setSpeech(null);setHistoryOpen(false);}} onReply={turn=>setSpeech(turn ? {npcId:npc.id,turn} : null)} onProfile={()=>setPanel(panel==="profile"?null:"profile")} historyOpen={historyOpen} onHistory={setHistoryOpen} />}
        </div>
        {panel === "profile" && npc && <aside className="paper profile" aria-label="居民档案" data-testid="profile">
          <div className="panel-heading"><span>居 民 档 案</span><button aria-label="关闭档案" onClick={() => setPanel(null)}>×</button></div>
          <div className="identity"><span className={`portrait ${npc.id}`} aria-hidden>{npc.id === "aqing" ? "晴" : "宁"}</span><div><h2>{npc.name}</h2><p>{npc.personality === "outgoing" ? "外向 · 喜欢热闹" : "安静 · 喜欢阅读"}</p></div></div>
          <p className="location">⌖ {npcPlace(npc,world)}</p>
          <dl className="needs">{([["hunger", "饥饿", "越低越饱足"], ["energy", "精力", "越高越有活力"], ["mood", "心情", "越高越愉快"]] as const).map(([key,label,hint]) => <div key={key}><dt>{label}<small>{hint}</small></dt><dd><span data-testid={`stat-${key}`}>{npc[key]}</span><span className={`meter ${key}`}><span style={{width:`${npc[key]}%`}} /></span></dd></div>)}</dl>
          <div className="decision"><small>此刻的行动</small><h3 data-testid="npc-action">{npc.action}</h3><p>{npc.reason}</p></div>
          <p className="profile-foot">{worldTime(world.minute)} · 来自已保存的世界</p>
          <button className="profile-chat" disabled={pending||!present} onClick={()=>{setPanel(null);setChatOpen(true);}}>与{npc.name}对话 <span aria-hidden>↗</span></button>
        </aside>}
      </section>
      <section className="town-bottom">
        <div className="residents"><small>今日居民</small><div>{world.npcs.map(n => <button key={n.id} disabled={n.sceneId!==sceneId} aria-pressed={selected===n.id} onClick={() => select(n.id)}><span className={`resident-dot ${n.id}`} />{n.name}<span className="resident-action">{n.sceneId!==sceneId?SCENES[n.sceneId].name:n.action}</span></button>)}</div></div>
        <div className="latest"><div className="latest-title"><h2>街角近况</h2><button onClick={() => setPanel("log")}>打开日志 <span aria-hidden>↗</span></button></div><div data-testid="latest-events">{world.events.length ? world.events.slice(-2).map(e => <p key={e.id}><time>{worldTime(e.minute).split(" · ")[1]}</time>{e.text}</p>) : <p className="muted">清晨的小镇刚刚醒来，日常将在下一步发生。</p>}</div></div>
      </section>
      <footer><span>共享存档：所有访客可推进、暂停和送食物。</span><span data-testid="revision">存档版本 {world.revision}</span></footer>
      <dialog ref={dialog} className="paper log-dialog" onCancel={() => setPanel(null)}>
        <div className="panel-heading"><h2>小镇日志</h2><button autoFocus aria-label="关闭日志" onClick={() => setPanel(null)}>×</button></div>
        <p className="muted">最近 100 条已保存事件 · 新的在前</p>
        <div className="log-list">{world.events.length ? [...world.events].reverse().map(e => <article key={e.id}><time>{worldTime(e.minute)}</time><h3>{e.text}</h3><p>{e.reason}</p></article>) : <p>还没有发生事件。推进一步，看看居民的选择。</p>}</div>
      </dialog>
    </> : <section className="loading-paper paper"><h2>翻开小镇手记</h2><p>{error ? "数据库连接尚未就绪，页面不会生成虚假的世界。" : "正在从后台读取两位居民的日常…"}</p></section>}
  </main>;
}
