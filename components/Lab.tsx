'use client';
import { useEffect, useState } from 'react';
import { envs } from '@/envs/index';
import type { Env } from '@/lib/env';
import type { Brain } from '@/lib/loop';
import { decodeBrain, encodeBrain, toSkillMd } from '@/lib/share';
import { SPEEDS, useLive, useLiveLoop, type Live, type Speed } from '@/lib/useLiveLoop';
import { BetaCurves } from './BetaCurves';
import { PolicyDiff } from './PolicyDiff';
import { QHeatmap } from './QHeatmap';
import { RatchetClick } from './RatchetClick';
import { Window } from './Section';
import { Sparkline } from './Sparkline';
import { SprtNeedle } from './SprtNeedle';
import { Steering } from './Steering';

const HINT = 'learnabolic.lab-hint';
const fmt = (x: number) => (Number.isFinite(x) ? x.toFixed(2) : '—');
const message = (err: unknown) => (err instanceof Error ? err.message : String(err));

// Policy | fitness (or the env's Viewer) | instruments. Every number is the live loop running core.mjs.
function Panels({ live, compact = false }: { live: Live; compact?: boolean }) {
  const { env, view: v } = live;
  if (!v) return <div className="lab-skeleton" />;
  const active = v.pool.find((c) => c.id === v.activeId), Viewer = env.Viewer;
  return (
    <div className={compact ? 'lab compact' : 'lab'}>
      <Window title={`${env.id}/SKILL.md`} className="lab-policy">
        <p className="lab-gen"><RatchetClick generation={v.generation} /> gen {v.generation} · champion {v.championId}</p>
        <PolicyDiff id={v.championId} text={env.toText(v.champion)} />
      </Window>
      <Window title="fitness.log" className="lab-center">
        {Viewer ? <Viewer champion={v.champion} challenger={active?.policy} seed={7} speed={SPEEDS[live.speed]} />
          : <Sparkline points={v.trace} label={`Champion fitness ${fmt(v.fitness)} at generation ${v.generation}`} />}
        <p className="lab-readout">
          <span>fitness <b>{fmt(v.fitness)}</b></span>
          {v.last && <span className={v.last.promoted ? 'promoted' : 'fade-reject'}>{v.last.promoted ? 'PROMOTED' : 'rejected'} {v.last.id} · {v.last.direction}</span>}
          {v.plateau && <span className="chip">PLATEAU → exploring · τ {v.tau.toFixed(1)}</span>}
        </p>
      </Window>
      {!compact && (
        <Window title="instruments" className="lab-right">
          <p className="kicker">Q-direction</p>
          <QHeatmap q={v.q} directions={env.directions} state={v.qState} choice={v.choice} />
          <p className="kicker">SPRT · {active?.id ?? '—'}</p>
          <SprtNeedle llr={active?.llr} n={active?.n} stamp={v.last && (v.last.promoted ? 'kept' : 'reverted')} />
          <p className="kicker">Thompson · pool</p>
          <BetaCurves items={v.pool} activeId={v.activeId} />
        </Window>
      )}
      <p className="sr-only" aria-live="polite">Generation {v.generation}, champion {v.championId}</p>
    </div>
  );
}

function Controls({ live, children }: { live: Live; children?: React.ReactNode }) {
  return (
    <div className="controls" role="group" aria-label="Loop controls">
      <button type="button" className="btn btn-primary" onClick={() => live.setPlaying(!live.playing)}>{live.playing ? '❚❚ Pause' : '▶ Play'}</button>
      {(Object.keys(SPEEDS) as Speed[]).map((s) => (
        <button type="button" key={s} className="btn" aria-pressed={live.speed === s} onClick={() => { live.setSpeed(s); live.setPlaying(true); }}>{s}</button>
      ))}
      {children}
    </div>
  );
}

// The landing teaser runs on the page's shared loop.
export function LabTeaser() {
  const live = useLive();
  return <div className="teaser"><Panels live={live} compact /><Controls live={live} /></div>;
}

export function ShareBrainLink({ className = '' }: { className?: string }) {
  const live = useLive();
  const [error, setError] = useState<string | null>(null);
  const go = () => encodeBrain(live.loop.snapshot()).then((b) => window.location.assign(`/lab#b=${b}`), (err: unknown) => setError(message(err)));
  return <>
    <button type="button" className={`btn ${className}`} onClick={go}>Share my brain →</button>
    {error && <p role="alert" className="banner error">Couldn&apos;t share: {error}</p>}
  </>;
}

// /lab: reads #env= or #b= (a shared brain), then runs that env full width.
export function Lab() {
  const [envId, setEnvId] = useState<string | null>(null);
  const [brain, setBrain] = useState<Brain | null>(null);
  const [note, setNote] = useState<string | null>(null);
  useEffect(() => {
    const hash = new URLSearchParams(window.location.hash.slice(1)), b = hash.get('b'), e = hash.get('env') ?? 'sim';
    if (b) {
      decodeBrain(b).then((br) => {
        if (!envs[br.envId]) throw new Error(`unknown env "${br.envId}"`);
        setBrain(br);
        setEnvId(br.envId);
      }).catch((err: unknown) => { setNote(`Couldn't read this brain: ${message(err)}`); setEnvId('sim'); });
    } else if (envs[e]) setEnvId(e);
    else { setNote(`Unknown env "${e}"; showing sim.`); setEnvId('sim'); }
  }, []);
  if (!envId) return <div className="lab-skeleton" />;
  const pick = (id: string) => { window.history.replaceState(null, '', `#env=${id}`); setBrain(null); setNote(null); setEnvId(id); };
  return <LabRun key={envId} env={envs[envId]} brain={brain} note={note} setNote={setNote} pick={pick} />;
}

type RunProps = { env: Env<unknown>; brain: Brain | null; note: string | null; setNote: (n: string | null) => void; pick: (id: string) => void };
function LabRun({ env, brain, note, setNote, pick }: RunProps) {
  const live = useLiveLoop(env);
  const [hint, setHint] = useState(false);
  useEffect(() => {
    if (!brain) return;
    try {
      live.loop.restore(brain);
      setNote(`Forked brain · gen ${brain.generation}`);
    } catch (err) {
      setNote(`Couldn't restore this brain: ${message(err)}`);
    }
  }, [brain, live.loop, setNote]);
  useEffect(() => {
    try { setHint(localStorage.getItem(HINT) !== 'off'); } catch { setHint(true); } // storage blocked: show the hint every visit
  }, []);
  const dismiss = () => {
    setHint(false);
    try { localStorage.setItem(HINT, 'off'); } catch { /* storage blocked: the hint comes back next visit, by design */ }
  };
  const share = async () => {
    const url = `${window.location.origin}/lab#b=${await encodeBrain(live.loop.snapshot())}`;
    window.history.replaceState(null, '', url);
    await navigator.clipboard.writeText(url).then(() => setNote('Link copied. Whoever opens it forks this brain.'), () => setNote('Clipboard unavailable: copy the link from the address bar.'));
  };
  const download = () => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([toSkillMd(env, live.loop.snapshot())], { type: 'text/markdown' }));
    a.download = `${env.id}-SKILL.md`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };
  const problem = live.failure ?? live.view?.error;
  return (
    <>
      {note && <p className="banner" role="status">{note} <button type="button" className="link" onClick={() => setNote(null)}>dismiss</button></p>}
      {hint && <p className="banner hint">Press Play. Then drag Cheap. <button type="button" className="link" onClick={dismiss}>got it</button></p>}
      {problem && <p className="banner error" role="alert">The loop hit a problem: {problem}</p>}
      <Panels live={live} />
      <div className="lab-bottom">
        {live.view && <Steering goals={env.goals} weights={live.view.weights} onChange={(w) => live.loop.setWeights(w)} />}
        <div className="lab-actions">
          <Controls live={live}><button type="button" className="btn" onClick={live.reset}>↺ Reset</button></Controls>
          <div className="controls">
            <label className="env-pick">Env{' '}
              <select value={env.id} onChange={(e) => pick(e.target.value)}>
                {Object.values(envs).map((e) => <option key={e.id} value={e.id}>{e.title}</option>)}
              </select>
            </label>
            <button type="button" className="btn" onClick={() => share().catch((err: unknown) => setNote(`Couldn't share: ${message(err)}`))}>Share my brain</button>
            <button type="button" className="btn" onClick={download}>⤓ Download SKILL.md</button>
          </div>
        </div>
      </div>
    </>
  );
}
