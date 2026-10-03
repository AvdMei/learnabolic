'use client';
import { useEffect, useReducer, useRef, useState, type ReactNode } from 'react';
import { useIsOnScreen } from '@/lib/useIsOnScreen';
import { INSTALL } from '@/lib/siteLinks';
import { RatchetClick } from './RatchetClick';
import { Window } from './Section';

// Replays a REAL learnabolic CLI run (recorded by the playground's demo.mjs --trace). Every id, rating, LLR and
// fitness on screen comes from the recorded CLI output; only the commit-message wording (commitFor) is illustrative.
type Ev = { type: 'init' | 'pick' | 'propose' | 'score'; use?: number; id?: string; parent?: string; direction?: string; rating?: number; text: string; out: string };
type Trace = { seed: number; events: Ev[] };
type Line = { cls: string; text: string };
type Chat = { k: number } & ({ kind: 'user'; text: string } | { kind: 'claude'; body: ReactNode } | { kind: 'tool'; cmd: string; lines: Line[] } | { kind: 'rating'; hit: number | null });
type Row = { id: string; direction: string; text: string; llr: number; state: '' | 'won' | 'out' };
type Model = {
  chat: Chat[]; pool: Row[]; skill: string; fresh: string[]; gen: number; champ: string; fit: string; uses: number;
  tape: { k: number; id: string; rating: number; ch: boolean }[]; cap: { step: string; text: ReactNode; spot: 'chat' | 'brain' | null }; progress: number; flash: boolean;
};

const LIMIT = Math.log(9); // SPRT boundary for α = β = 0.1 (core.mjs defaults)
const CLI = 'node …/cli.mjs';
const bullets = (text: string) => text.split('\n').filter((l) => l.startsWith('- ')).map((l) => l.slice(2));
const lineOf = (line: string): Line => ({
  cls: /^PROMOTED/.test(line) ? 'good' : /^REJECTED/.test(line) ? 'bad' : /^PROPOSE/.test(line) ? 'prop' : /^(NEXT|AFTER USE)/.test(line) ? 'dim' : 'ok',
  text: line.replaceAll('node cli ', `${CLI} `).replaceAll(/\bcli\b(?= (pick|score|propose))/g, CLI),
});
const fresh = (): Model => ({ chat: [], pool: [], skill: '', fresh: [], gen: 0, champ: 'v0', fit: '', uses: 0, tape: [], cap: { step: '', text: 'Loading the recorded run…', spot: null }, progress: 0, flash: false });

// Illustrative commit messages that follow the variant's rules (the rating itself is from the trace).
const TOPICS = [
  ['Updated the token refresh logic so expired sessions renew automatically and tidied some helpers', 'Refresh expired auth tokens', 'fix(auth)'],
  ['Added a docs section that explains how and when the retry policy retries failed requests', 'Document the retry policy', 'docs'],
  ['Changed the parser so it no longer crashes when the uploader sends an empty input file', 'Handle empty input files in parser', 'fix(parser)'],
];
function commitFor(text: string, use: number) {
  const [long, short, type] = TOPICS[use % TOPICS.length];
  const subject = /Example:/.test(text) ? `${type}: ${short[0].toLowerCase()}${short.slice(1)}` : /under 50/.test(text) ? short : long;
  return /emoji/.test(text) ? `🎉 ${subject}` : subject;
}

// Which real events get the slow, narrated treatment; everything else fast-forwards (~6 s per stretch).
export function plan(raw: Ev[]) {
  const rank = { init: 0, pick: 1, score: 2, propose: 3 }; // a proposal reads best after the rating of the same use; no number changes
  const events = raw.map((e, i) => [e, i] as const).sort(([a, i], [b, j]) => (a.use ?? 0) - (b.use ?? 0) || rank[a.type] - rank[b.type] || i - j).map(([e]) => e);
  const scores = events.filter((e) => e.type === 'score');
  const promoteEv = scores.find((e) => /^PROMOTED/m.test(e.out));
  const rejectEv = promoteEv && scores.find((e) => e.use! > promoteEv.use! && /^REJECTED/m.test(e.out));
  if (!promoteEv || !rejectEv) throw new Error('This trace has no promotion followed by a rejection. Re-record with: node demo.mjs <seed> --trace reel');
  const explore = events.find((e) => e.type === 'propose' && e.id === /^REJECTED (v\d+)/m.exec(rejectEv.out)![1]);
  const winner = /^PROMOTED (v\d+)/m.exec(promoteEv.out)![1];
  const firstWinnerScore = scores.find((e) => e.id === winner)!;
  const detail = new Set([events[0], ...events.filter((e) => e.use === 1), events.find((e) => e.type === 'propose' && e.id === winner),
    events.find((e) => e.type === 'pick' && e.use === firstWinnerScore.use), firstWinnerScore, promoteEv, explore, rejectEv]);
  const quiet = (from: number, to: number) => scores.filter((e) => e.use! > from && e.use! < to && !detail.has(e)).length || 1;
  const ffDelay = (use: number) => Math.min(250, Math.max(30, 6000 / (use < promoteEv.use! ? quiet(1, promoteEv.use!) : quiet(promoteEv.use!, rejectEv.use!))));
  return { events, explore, promoteEv, rejectEv, detail, ffDelay };
}

export async function play(T: Trace, m: Model, update: () => void, sleep: (ms: number) => Promise<void>, reduced: boolean) {
  const story = plan(T.events), events = story.events, spoken = new Set<string>();
  let key = 0, champText = events[0].text, exploring = false;
  Object.assign(m, fresh(), { skill: champText });
  const say = (id: string, step: string, text: ReactNode, spot: Model['cap']['spot']) => { if (!spoken.has(id)) { spoken.add(id); m.cap = { step, text, spot }; update(); } };
  const post = <C extends Chat>(c: Omit<C, 'k'>) => { const item = { ...c, k: key++ } as C; m.chat = [...m.chat, item].slice(-9); update(); return item; };
  const user = async (text: string) => {
    const item = post<Extract<Chat, { kind: 'user' }>>({ kind: 'user', text: reduced ? text : '' });
    for (let i = 1; !reduced && i <= text.length; i += 2) { item.text = text.slice(0, i); update(); await sleep(44); }
    item.text = text; update(); await sleep(400);
  };
  const tool = async (cmd: string, out: string) => {
    const item = post<Extract<Chat, { kind: 'tool' }>>({ kind: 'tool', cmd, lines: [] });
    await sleep(350); item.lines = out.trim().split('\n').map(lineOf); update(); await sleep(500);
  };
  const claude = (body: ReactNode) => post<Extract<Chat, { kind: 'claude' }>>({ kind: 'claude', body });
  const diff = (add: string[], del: string[]) => <span className="reel-commit">{add.map((b) => <span key={`+${b}`} className="add">+ {b}</span>)}{del.map((b) => <span key={`-${b}`} className="del">− {b}</span>)}</span>;

  for (const e of events) {
    const slow = story.detail.has(e);
    m.progress = ((e.use ?? 0) / story.rejectEv.use!) * 100;
    if (e.type === 'init') {
      say('init', '① start', <>One sentence to your agent. Learnabolic snapshots your skill as <b>v0</b>, the champion.</>, 'chat');
      await user('Track my commit-message skill with learnabolic and learn from my ratings.');
      await tool(`${CLI} init commit-message --from .claude/skills/commit-message/SKILL.md`, e.out.split('\n')[0]);
      await sleep(1600);
    } else if (e.type === 'pick') {
      if (!slow) continue;
      if (e.id !== m.champ) say('ab', '⑤ a quiet A/B test', "Half the time you get a challenger. Its rating is compared with the champion's recent ratings.", 'brain');
      else say('pick', '② pick', 'Before every use, the agent asks learnabolic which version of the skill to follow.', 'chat');
      await user('Commit my staged changes.');
      await tool(`${CLI} pick commit-message`, e.out);
    } else if (e.type === 'propose') {
      m.pool = [...m.pool, { id: e.id!, direction: e.direction!, text: e.text, llr: 0, state: '' }]; update();
      if (!slow) continue;
      const parentText = e.parent === m.champ ? champText : m.pool.find((r) => r.id === e.parent)?.text ?? champText;
      if (e === story.explore) exploring = true;
      if (e === story.explore) say('explore', '⑧ not every idea is good', <>The next edit (<b>{e.direction}</b>) looks plausible. Your ratings will decide.</>, 'chat');
      else say('propose', '④ the LLM proposes', <>Learnabolic picks a direction (<b>{e.direction}</b>). Claude writes one small edit, never a rewrite.</>, 'chat');
      claude(<>Learnabolic asked for a small <b>{e.direction}</b> edit. Writing {e.id}:{diff(bullets(e.text).filter((b) => !bullets(parentText).includes(b)), bullets(parentText).filter((b) => !bullets(e.text).includes(b)))}</>);
      await sleep(1400);
      await tool(`${CLI} propose commit-message ${e.id} --direction ${e.direction}`, e.out.split('\n')[0]);
      await sleep(1600);
    } else {
      m.uses = e.use!;
      const llr = /LLR (-?[\d.]+)/.exec(e.out)?.[1], row = m.pool.find((r) => r.id === e.id);
      if (llr && row) row.llr = Number(llr);
      m.tape = [...m.tape, { k: key++, id: e.id!, rating: e.rating!, ch: e.id !== m.champ }].slice(-36);
      update();
      const promoted = /^PROMOTED (v\d+) \(fitness (\S+) → (\S+)\)/m.exec(e.out), rejected = /^REJECTED (v\d+)/m.exec(e.out);
      if (slow) {
        if (e.use === 1) say('rate', '③ your rating', 'You rate the result. That number is the only feedback: no API key, no judge model.', 'chat');
        if (e === story.rejectEv) say('reject', '⑩ rejected', <><b>{rejected![1]}</b> kept losing on your ratings, so it is dropped. It never ships.</>, 'brain');
        claude(<>Here&apos;s the commit message:<span className="reel-commit">{commitFor(e.text, e.use!)}</span>How would you rate it, 0–10?</>);
        await sleep(900);
        const scale = post<Extract<Chat, { kind: 'rating' }>>({ kind: 'rating', hit: null });
        await sleep(600); scale.hit = e.rating!; update(); await sleep(500);
        await user(String(e.rating));
        await tool(`${CLI} score commit-message ${e.rating}`, e.out.split('\n').filter((l) => !l.startsWith('NEXT')).join('\n'));
      } else {
        if (m.gen === 0 && spoken.has('ab')) say('ff', '⑥ statistics dispose', 'Each rating nudges the evidence needle. Nothing changes until the evidence is decisive.', 'brain');
        if (exploring) say('quiet', '⑨ testing, quietly', 'Thompson sampling gives a weak idea fewer tries, so you rarely see it.', 'brain');
        const last = m.chat.at(-1), ff = { kind: 'tool' as const, cmd: `⏩ fast-forward · use ${e.use}: ${e.id} rated ${e.rating}`, lines: [lineOf(e.out.split('\n')[0])] };
        if (last?.kind === 'tool' && last.cmd.startsWith('⏩')) { Object.assign(last, ff); update(); } else post<Extract<Chat, { kind: 'tool' }>>(ff);
        await sleep(story.ffDelay(e.use!));
      }
      if (promoted) {
        say('promote', '⑦ ratchet click', <><b>{promoted[1]}</b> won on your ratings, so it becomes the skill. It can&apos;t slip back.</>, 'brain');
        const next = m.pool.find((r) => r.id === promoted[1])!.text;
        m.fresh = bullets(next).filter((b) => !bullets(champText).includes(b));
        champText = next;
        Object.assign(m, { champ: promoted[1], gen: m.gen + 1, fit: `fitness ${promoted[2]} → ${promoted[3]}`, skill: next, flash: true }); // the ratchet clicks once per promotion
        for (const r of m.pool) r.state = r.id === promoted[1] ? 'won' : 'out';
        update();
        if (!slow) await tool(`${CLI} score commit-message ${e.rating}`, e.out.split('\n')[0]);
        await sleep(3200);
        Object.assign(m, { flash: false, pool: [] }); update();
      }
      if (rejected) {
        const r = m.pool.find((x) => x.id === rejected[1]);
        if (r) { r.state = 'out'; update(); }
        if (e === story.rejectEv) break;
      }
    }
  }
  await sleep(2600);
  const learned = bullets(champText).filter((b) => !bullets(events[0].text).includes(b));
  m.cap = { step: 'learned your taste', text: <>From <b>{m.uses}</b> ratings: {learned.map((b) => <span key={b} className="add">+ {b} </span>)}<br /><code>{INSTALL}</code></>, spot: 'brain' };
  update();
  await sleep(6500);
}

export function Reel() {
  const ref = useRef<HTMLDivElement>(null), onScreen = useIsOnScreen(ref), model = useRef<Model>(fresh());
  const [, update] = useReducer((x: number) => x + 1, 0);
  const [trace, setTrace] = useState<Trace | null>(null);
  const [paused, setPaused] = useState(false);
  const gate = useRef({ paused, onScreen });
  gate.current = { paused, onScreen };

  useEffect(() => { // fetch the recording only once the reel scrolls into view
    if (!onScreen || trace) return;
    fetch('/reel-trace.json').then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)))).then(setTrace, (err: unknown) => {
      model.current.cap = { step: 'error', text: `Couldn't load the recorded run: ${err instanceof Error ? err.message : String(err)}`, spot: null };
      update();
    });
  }, [onScreen, trace]);

  useEffect(() => {
    if (!trace) return;
    const stop = new AbortController(), reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const sleep = async (ms: number) => { // waits while paused, offscreen or in a hidden tab
      for (let t = 0; t < ms; t += 50) {
        do {
          if (stop.signal.aborted) throw stop.signal.reason;
          await new Promise((r) => setTimeout(r, 50));
        } while (gate.current.paused || !gate.current.onScreen || document.hidden);
      }
    };
    (async () => { for (;;) await play(trace, model.current, update, sleep, reduced); })().catch((err: unknown) => {
      if (stop.signal.aborted) return; // unmounted: nothing to report
      model.current.cap = { step: 'error', text: err instanceof Error ? err.message : String(err), spot: null };
      update();
    });
    return () => stop.abort();
  }, [trace]);

  const m = model.current;
  return (
    <div className="reel" id="reel" ref={ref}>
      <div className="reel-stage">
        <Window title="claude code · your project" className={`reel-chat ${m.cap.spot === 'chat' ? 'spot' : ''}`}>
          {m.chat.map((c) => c.kind === 'user' ? <p key={c.k} className="reel-msg user">{c.text}</p>
            : c.kind === 'claude' ? <div key={c.k} className="reel-msg claude"><b>Claude</b>{c.body}</div>
            : c.kind === 'rating' ? <p key={c.k} className="reel-rating" aria-label={c.hit === null ? 'Rating scale 0 to 10' : `Rated ${c.hit}`}>{Array.from({ length: 11 }, (_, n) => <span key={n} className={n === c.hit ? 'hit' : ''}>{n}</span>)}</p>
            : <pre key={c.k} className="reel-tool"><span className="cmd">{c.cmd.startsWith('⏩') ? c.cmd : `$ ${c.cmd}`}</span>{c.lines.map((l, i) => <span key={i} className={l.cls}>{'\n'}{l.text}</span>)}</pre>)}
        </Window>
        <Window title="learnabolic · commit-message" className={`reel-brain ${m.cap.spot === 'brain' ? 'spot' : ''} ${m.flash ? 'reel-flash' : ''}`}>
          <p className="reel-label"><span>champion <b>{m.champ}</b> <span className="muted">{m.fit}</span></span><span>gen <b>{m.gen}</b> <RatchetClick generation={m.gen} size={16} /></span></p>
          <div className="reel-skill">{bullets(m.skill).map((b) => <div key={b} className={m.fresh.includes(b) ? 'new' : ''}>- {b}</div>)}</div>
          <p className="reel-label"><span>challengers</span><span>reject ◂ evidence ▸ promote</span></p>
          <div className="reel-pool">{m.pool.map((r) => (
            <div key={r.id} className={`reel-row ${r.state}`} title="evidence (log-likelihood ratio)">
              <b>{r.id}</b><span className="dir">{r.direction}</span>
              <span className="gauge"><i style={{ left: `${Math.max(0, Math.min(100, 50 + (r.llr / LIMIT) * 50))}%` }} /></span>
            </div>))}
          </div>
          <p className="reel-label"><span>your ratings</span><span>{m.uses} uses</span></p>
          <div className="reel-tape">{m.tape.map((t) => <span key={t.k} className={t.ch ? 'ch' : ''} title={`${t.id}: ${t.rating}/10`}>{t.rating}</span>)}</div>
        </Window>
        <div className="reel-caption" role="status" aria-live="polite"><small>{m.cap.step}</small><p>{m.cap.text}</p></div>
      </div>
      <div className="reel-progress" aria-hidden><i style={{ width: `${m.progress}%` }} /></div>
      <div className="reel-foot">
        <span>{trace ? `Replay of a real learnabolic CLI run (seed ${trace.seed}) · ratings from a simulated user with a hidden taste · commit-message wording is illustrative` : 'A recorded CLI run, loaded when you scroll here.'}</span>
        <button type="button" className="btn" onClick={() => setPaused(!paused)}>{paused ? '▶ Play' : '❚❚ Pause'}</button>
      </div>
    </div>
  );
}
