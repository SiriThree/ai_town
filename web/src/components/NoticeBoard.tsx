"use client";
import {useEffect,useRef,useState} from "react";
import {worldTime,type World} from "../lib/world";
import {activeGathering} from "../lib/gatherings";
export default function NoticeBoard({world,commit,onClose,diagnostics}:{world:World;commit:(w:World)=>void;onClose:()=>void;diagnostics:boolean}){
 const [owned,setOwned]=useState<string[]>([]),[ready,setReady]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState("");
 const suggested=Math.ceil((world.minute+60)/10)*10;
 const [day,setDay]=useState(Math.floor(suggested/1440)+1),[clock,setClock]=useState(`${String(Math.floor(suggested%1440/60)).padStart(2,"0")}:${String(suggested%60).padStart(2,"0")}`),[content,setContent]=useState("");
 const retry=useRef<{signature:string;id:string}|null>(null);
 useEffect(()=>{let active=true;fetch('/api/world/notices',{cache:'no-store'}).then(async r=>{const v=await r.json();if(!r.ok)throw Error(v.error);if(active){setOwned(v.ownedIds);commit(v.world);setReady(true);}}).catch(e=>{if(active)setError(e.message);});return()=>{active=false;};},[commit]);
 async function submit(action:"publish"|"cancel",id?:string){
  if(!ready||busy)return;setBusy(true);setError("");
  const [h,m]=clock.split(":").map(Number),data=action==="publish"?{action,content,location:"square",startMinute:(day-1)*1440+h*60+m}:{action,id};
  const signature=JSON.stringify(data);if(retry.current?.signature!==signature)retry.current={signature,id:crypto.randomUUID()};
  try{const r=await fetch('/api/world/notices',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...data,requestId:retry.current.id}),signal:AbortSignal.timeout(12000)}),v=await r.json();if(!r.ok)throw Error(v.error);commit(v.world);if(action==='publish'){setOwned(ids=>[...ids,v.noticeId]);setContent('');}retry.current=null;}catch(e){setError(e instanceof Error?e.message:'保存未确认，请核对后重试。');}finally{setBusy(false);}
 }
 const labels={scheduled:"等待相聚",active:"聚会进行中",ended:"聚会已结束",cancelled:"已取消"};
 const responses={accepted:"愿意参加",declined:"不参加",deferred:"忙完再看",travelling:"正在赶来",arrived:"已经到场",participated:"实际参加",missed:"未能参加",cancelled:"已取消"};
 return <aside className="paper notice-board" role="dialog" aria-modal="true" aria-label="小镇公告板" data-testid="notice-board" onKeyDown={e=>e.stopPropagation()} onPointerDown={e=>e.stopPropagation()}>
  <div className="panel-heading"><h2>小镇公告板</h2><button onClick={onClose} aria-label="关闭公告板">×</button></div>
  <p>约邻居到树荫广场聊聊 · 此刻 {worldTime(world.minute)}</p>
  <form onSubmit={e=>{e.preventDefault();void submit('publish');}}>
   <label>公开公告<textarea aria-label="公开公告" maxLength={120} value={content} onChange={e=>setContent(e.target.value)} required placeholder="今天下午四点，大家来广场聊聊天吧！"/></label>
   <div className="notice-time"><label>世界第几天<input aria-label="世界第几天" type="number" min="1" value={day} onChange={e=>setDay(Number(e.target.value))} required/></label><label>开始时刻<input aria-label="开始时刻" type="time" value={clock} onChange={e=>setClock(e.target.value)} required/></label><span>树荫广场 · 一小时</span></div>
   <p className="muted">正文公开给所有访客。请勿填写私人信息；以所选世界时间为准，暂停时不计时。</p>
   <button className="advance" disabled={!ready||busy}>{busy?"正在保存…":"发布聚会"}</button>{error&&<p role="alert">{error}</p>}
  </form>
  <div className="notice-history">{[...(world.gatherings??[])].reverse().map(a=><article key={a.id} data-testid="public-notice"><h3>{labels[a.status]} · {worldTime(a.startMinute)}</h3><p>{a.content}</p><small>树荫广场 · 发布于 {worldTime(a.createdMinute)}</small><ul>{a.responses.map(r=><li key={r.npcId}><strong>{world.npcs.find(n=>n.id===r.npcId)?.name} · {responses[r.status]}</strong><span>{r.reason}</span>{(r.history?.length??0)>1&&<details><summary>回应经过</summary>{r.history!.map((h,i)=><p key={i}>{worldTime(h.minute)} · {responses[h.status]}：{h.reason}</p>)}</details>}</li>)}</ul>{a.result&&<p>{a.result}</p>}{owned.includes(a.id)&&activeGathering(a)&&<button disabled={busy} onClick={()=>void submit('cancel',a.id)}>取消我的聚会</button>}{diagnostics&&<details><summary>活动诊断</summary><pre>{JSON.stringify(a,null,2)}</pre></details>}</article>)}{!world.gatherings?.length&&<p>还没有活动公告。</p>}</div>
 </aside>;
}
