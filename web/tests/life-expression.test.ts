import {describe,it,expect} from 'vitest';
import {advanceWorld,assertWorld,createWorld,populateResidents,restoreWorld,type World} from '../src/lib/world';
import {observeLife,lifeCandidates,LIFE_COOLDOWN} from '../src/lib/life-expression';
import {canTalk,beginSocial} from '../src/lib/social';
import {buildMessages} from '../src/lib/chat-context';
function seed(){return populateResidents(createWorld());}
function simulate(steps=900){let w=seed();const frames:World[]=[];for(let i=0;i<steps;i++){w=advanceWorld(w);assertWorld(w);frames.push(w);}return frames;}
describe('grounded life observations',()=>{
 it('uses real actions, bounded text, cooldown and topic dedup over a full day',()=>{
  const frames=simulate();const unique=[...new Map(frames.flatMap(w=>w.lifeExpressions??[]).map(e=>[e.id,e])).values()];
  expect(unique.length).toBeGreaterThan(10);expect(unique.some(e=>e.kind==='thought')).toBe(true);expect(unique.some(e=>e.topic==='working')).toBe(true);
  for(const e of unique){expect(Array.from(e.text).length).toBeLessThanOrEqual(30);expect(e.source.actionId).toBeTruthy();const frame=frames.find(w=>w.revision===e.revision)!;expect(frame.npcs.find(n=>n.id===e.npcId)!.action).toBe(e.source.action);}
  for(const n of frames[0].npcs){const own=unique.filter(e=>e.npcId===n.id);for(let i=1;i<own.length;i++){expect(own[i].minute-own[i-1].minute).toBeGreaterThanOrEqual(LIFE_COOLDOWN);const same=own.slice(0,i).filter(e=>e.topic===own[i].topic).at(-1);if(same)expect(own[i].minute-same.minute).toBeGreaterThanOrEqual(180);}}
 },15000);
 it('observations never mutate needs, work, public facts, relations or private data',()=>{
  const frames=simulate(100);for(let i=1;i<frames.length;i++){const next=structuredClone(frames[i]);delete next.lifeExpressions;const expected=structuredClone(next);observeLife(frames[i-1],next);delete next.lifeExpressions;expect(next).toEqual(expected);}
 });
 it('does not infer completed work from travelling or a partial step',()=>{
  const frames=simulate(200);for(const w of frames)for(const e of w.lifeExpressions??[]){if(e.topic==='work-step')expect(e.text).not.toMatch(/全部|货架整理完|完成工作/);if(e.topic==='working')expect(e.source.action).toContain('尚未完成');}
 });
 it('persists optional records compatibly without seeding old saves',()=>{const old=seed();expect(restoreWorld(old)).toEqual(old);const w=simulate(80).at(-1)!;expect(restoreWorld(JSON.parse(JSON.stringify(w)))).toEqual(w);});
 it('never feeds thoughts into other residents model context or public memories',()=>{
  const w=simulate(80).at(-1)!;const thought=w.lifeExpressions!.find(e=>e.kind==='thought')!;thought.text='只属于自己的内心观察标记';
  for(const npc of w.npcs){expect(JSON.stringify(buildMessages(npc,w,[],'你好'))).not.toContain(thought.text);expect(JSON.stringify(w.experiences?.memories[npc.id]??[])).not.toContain(thought.text);}
  expect(JSON.stringify(w.events)).not.toContain(thought.text);
 });
 it('sampling is deterministic and observing the same event again is idempotent',()=>{
  const before=seed(),after=advanceWorld(before),copy=structuredClone(after);observeLife(before,after);expect(after).toEqual(copy);expect(advanceWorld(before)).toEqual(copy);
 });
 it('hides other scenes, stale observations and all ambient lines under higher priorities',()=>{
  const w=simulate(90).at(-1)!;expect(lifeCandidates(w,'town',true)).toEqual([]);for(const e of lifeCandidates(w,'town',false)){expect(e.sceneId).toBe('town');expect(w.minute-e.minute).toBeLessThanOrEqual(12);}
  const later={...w,minute:w.minute+20};expect(lifeCandidates(later,'town',false)).toEqual([]);
 });
 it('formal conversations terminate, preserve work and do not increase trust through greetings',()=>{
  let w=seed();beginSocial(w);const c=w.conversations![0];expect(c.turns).toHaveLength(2);expect(w.experiences!.relations.every(r=>r.trust===0)).toBe(true);
  const participants=c.participants;for(let i=0;i<14;i++)w=advanceWorld(w);expect(w.conversations!.find(x=>x.id===c.id)!.timeline!.completed).toBe(true);expect(w.npcs.filter(n=>participants.includes(n.id)).some(n=>n.ongoing)).toBe(true);
  const a=w.npcs[0],b=w.npcs[1];expect(canTalk({...a,action:'正在理货'},b,w)).toBe(false);
 });
});
