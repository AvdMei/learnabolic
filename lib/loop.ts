import { rng, normalize, thompson, sprtStep, sprt, chooseDirection, qUpdate, cusum, fitness } from '../skills/learnabolic/scripts/core.mjs';
import type { Env, Summary } from './env.ts';

// The generic learning loop over any Env, with the CLI's semantics (see cli.mjs decide()). DOM-free.
const POOL = 3, BATCH = 8, KEEP = 64, TAU_BASE = 0.5, TAU_CAP = 4, TRACE = 1500;
type Scores = Record<string, number>;
type Q = Record<string, Record<string, number>>;
export type Row = { t: string; event: string; variant: string | null; direction: string | null; s: number | null; decision: string | null; fitness: number | null };
export type Lineage = { id: string; parent: string | null; direction: string | null; generation: number };
// IMPORTANT: same shape as `cli export` (plus envId and policy), so `cli init --from` can bootstrap from it.
export type Brain = { version: 1; generation: number; q: Q; fitnessHistory: number[]; lineage: Lineage[]; ledger: Row[]; envId: string; policy: string };
export type Challenger<P> = { id: string; policy: P; parent: string; direction: string; qState: string; a: number; b: number; llr: number; n: number; sSum: number; eps: Scores[] };
export type Decision = { id: string; direction: string; promoted: boolean; before: number; after: number };
export type Point = { f: number; promoted: boolean; plateau: boolean };
export type View<P> = {
  generation: number; championId: string; champion: P; means: Scores; fitness: number; pool: Challenger<P>[]; activeId: string | null;
  q: Q; qState: string; choice: { state: string; direction: string } | null; tau: number; plateau: boolean;
  trace: Point[]; last: Decision | null; weights: Scores; error: string | null;
};

const RATCHETS = { sprt: (v: { llr: number; n: number }) => sprt(v.llr, v.n) };
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const pushCapped = <T,>(xs: T[], x: T, cap: number) => { xs.push(x); if (xs.length > cap) xs.shift(); };

export function createLoop<P>(env: Env<P>, { seed, weights: w }: { seed: number; weights?: Scores }) {
  const rand = rng(seed), decide = RATCHETS[env.ratchet ?? 'sprt'], listeners = new Set<(v: View<P>) => void>();
  const history: Record<string, number[]> = {};
  let weights: Scores = w ?? Object.fromEntries(env.goals.map((k) => [k.id, k.weight]));
  let champ = { id: 'v0', policy: env.seed, eps: [] as Scores[] }, pool: Challenger<P>[] = [], inflight = 0, epoch = 0, nextId = 1;
  let generation = 0, q: Q = {}, tau = TAU_BASE, cus: ReturnType<typeof cusum> | Record<string, never> = {}, fitnessHistory: number[] = [];
  let lineage: Lineage[] = [{ id: 'v0', parent: null, direction: null, generation: 0 }], ledger: Row[] = [];
  let trace: Point[] = [], last: Decision | null = null, choice: View<P>['choice'] = null, activeId: string | null = null, error: string | null = null;

  const log = (event: string, f: Partial<Row>) => {
    ledger = [...ledger, { t: new Date().toISOString(), event, variant: null, direction: null, s: null, decision: null, fitness: null, ...f }].slice(-50);
  };
  const means = (eps: Scores[]) => Object.fromEntries(eps.length ? env.goals.map((k) => [k.id, mean(eps.map((e) => e[k.id]))]) : []);
  const champFitness = () => fitness(means(champ.eps), weights);
  function qState() {
    const m = Object.entries(means(champ.eps)).sort((x, y) => x[1] - y[1]);
    const [prev, lastF] = fitnessHistory.slice(-2);
    const trend = lastF === undefined ? 'flat' : lastF - prev > 0.01 ? 'up' : prev - lastF > 0.01 ? 'down' : 'flat';
    return `${m[0]?.[0] ?? env.goals[0].id}|${trend}`;
  }
  function summary(): Summary {
    const worst = [...champ.eps].sort((a, b) => fitness(a, weights) - fitness(b, weights)).slice(0, 3);
    return { means: means(champ.eps), worst };
  }
  // One episode → s per KR (normalize with the 1A spec grammar).
  function evaluate(policy: P, s: number): Scores {
    const raw = env.episode(policy, s), out: Scores = {};
    for (const k of env.goals) {
      out[k.id] = normalize(raw[k.id], k.spec, (history[k.id] ??= []));
      pushCapped(history[k.id], raw[k.id], 50);
    }
    return out;
  }

  // The ratchet resolved: promote or reject, then teach Q, CUSUM and tau exactly as the CLI does.
  function resolve(v: Challenger<P>, promoted: boolean) {
    const before = champFitness();
    pool = pool.filter((c) => c !== v);
    if (promoted) {
      pool = []; // the other challengers were edits of the old champion: superseded, no Q update
      champ = { id: v.id, policy: v.policy, eps: v.eps };
      generation += 1;
      tau = TAU_BASE;
      epoch += 1;
      lineage = [...lineage, { id: v.id, parent: v.parent, direction: v.direction, generation }];
    }
    const after = champFitness();
    if (!fitnessHistory.length && Number.isFinite(before)) fitnessHistory.push(before);
    q = qUpdate(q, v.qState, v.direction, (v.n ? v.sSum / v.n : 0.5) - 0.5 + (promoted ? 1 : -1), qState());
    if (Number.isFinite(after)) {
      cus = cusum(cus, fitnessHistory.length ? after - fitnessHistory[fitnessHistory.length - 1] : 0);
      fitnessHistory = [...fitnessHistory, after].slice(-100);
      if (cus.plateau) tau = Math.min(tau * 1.5, TAU_CAP);
      trace = [...trace, { f: after, promoted, plateau: Boolean(cus.plateau) }].slice(-TRACE);
    }
    last = { id: v.id, direction: v.direction, promoted, before, after };
    log(promoted ? 'promote' : 'reject', { variant: v.id, direction: v.direction, decision: promoted ? 'promote' : 'reject', fitness: Number.isFinite(after) ? after : null });
  }

  // Keep up to 3 challengers: Q picks a direction, the env proposes. In-flight proposals never block.
  function refill() {
    while (pool.length + inflight < POOL) {
      const state = qState(), direction = chooseDirection(q, state, env.directions, tau, rand), id = `v${nextId++}`, parent = champ.id, mine = epoch;
      choice = { state, direction };
      inflight += 1;
      env.propose(champ.policy, direction, summary()).then(
        (policy) => {
          inflight -= 1;
          if (mine !== epoch) return; // the champion changed meanwhile: superseded
          const v: Challenger<P> = { id, policy: policy ?? champ.policy, parent, direction, qState: state, a: 1, b: 1, llr: 0, n: 0, sSum: 0, eps: [] };
          if (policy === null) return resolve(v, false); // an empty proposal counts as a rejection
          pool.push(v);
          log('propose', { variant: id, direction });
        },
        (err: unknown) => {
          inflight -= 1;
          error = `propose (${direction}) failed: ${err instanceof Error ? err.message : String(err)}`;
          if (mine === epoch) resolve({ id, policy: champ.policy, parent, direction, qState: state, a: 1, b: 1, llr: 0, n: 0, sSum: 0, eps: [] }, false);
        },
      );
    }
  }

  // Thompson picks a challenger; 8 shared seeds; s = 1 / 0.5 / 0 by weighted fitness against the champion.
  function batch() {
    activeId = thompson(pool.map(({ id, a, b }) => ({ id, a, b })), rand);
    const v = pool.find((c) => c.id === activeId)!;
    for (let i = 0; i < BATCH; i++) {
      const s0 = Math.floor(rand() * 2 ** 32), h = evaluate(champ.policy, s0), c = evaluate(v.policy, s0);
      const fh = fitness(h, weights), fc = fitness(c, weights), s = fc > fh ? 1 : fc === fh ? 0.5 : 0;
      Object.assign(v, { a: v.a + s, b: v.b + 1 - s, llr: sprtStep(v.llr, s), n: v.n + 1, sSum: v.sSum + s });
      pushCapped(champ.eps, h, KEEP);
      pushCapped(v.eps, c, KEEP);
    }
    const d = decide(v);
    if (d !== 'continue') resolve(v, d === 'promote');
  }

  const view = (): View<P> => ({
    generation, championId: champ.id, champion: champ.policy, means: means(champ.eps), fitness: champFitness(), pool: [...pool], activeId,
    q, qState: qState(), choice, tau, plateau: Boolean(cus.plateau), trace, last, weights, error,
  });
  const emit = () => { const v = view(); listeners.forEach((fn) => fn(v)); };
  let running = false;
  log('init', { variant: 'v0' });

  return {
    // Runs up to n batches; yields one microtask when the pool is empty so instant proposals can land.
    async step(n: number) {
      if (running) return;
      running = true;
      try {
        for (let i = 0; i < n; i++) {
          refill();
          if (!pool.length) {
            await Promise.resolve();
            if (!pool.length) { if (inflight) break; continue; }
          }
          batch();
        }
      } finally {
        running = false;
      }
      emit();
    },
    subscribe(fn: (v: View<P>) => void) {
      listeners.add(fn);
      fn(view());
      return () => { listeners.delete(fn); };
    },
    setWeights(next: Scores) {
      weights = { ...weights, ...next };
      emit();
    },
    snapshot(): Brain {
      return { version: 1, generation, q, fitnessHistory, lineage, ledger, envId: env.id, policy: env.toText(champ.policy) };
    },
    restore(b: Brain) {
      const policy = env.fromText(b.policy);
      if (b.envId !== env.id) throw new Error(`this brain belongs to env "${b.envId}", not "${env.id}"`);
      if (!policy) throw new Error(`the policy text is not a valid ${env.id} policy`);
      champ = { id: b.lineage[b.lineage.length - 1].id, policy, eps: [] };
      ({ generation, q, fitnessHistory, lineage, ledger } = b);
      nextId = Math.max(...lineage.map((l) => Number(l.id.slice(1)))) + 1;
      Object.assign(history, Object.fromEntries(env.goals.map((k) => [k.id, []])));
      pool = []; epoch += 1; tau = TAU_BASE; cus = {}; last = null; activeId = null; error = null;
      trace = fitnessHistory.map((f) => ({ f, promoted: false, plateau: false }));
      emit();
    },
  };
}
export type Loop<P> = ReturnType<typeof createLoop<P>>;
