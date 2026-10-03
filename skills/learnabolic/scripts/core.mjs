// Learnabolic core: the statistics that decide which edits to a skill survive.
// The LLM proposes, statistics disposes. Pure functions, no dependencies, seeded randomness.

/**
 * Seeded random number generator (mulberry32). Same seed, same sequence: runs are reproducible.
 * @param {number} seed 32-bit integer seed.
 * @returns {() => number} A function returning uniform floats in [0, 1).
 */
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), a | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// --- Score adapter: any raw number becomes s ∈ [0, 1], where higher is always better. ---

const NUM = String.raw`-?\d*\.?\d+`;
const SPEC = new RegExp(`^(?:(auto)|(${NUM})\\.\\.(${NUM}))\\s+(higher|lower)(?:\\s+target\\s+(${NUM}))?$`);

/** Parses a KR spec such as `0..10 higher target 8` or `auto lower`. Throws on anything else. */
function parseSpec(text) {
  const m = SPEC.exec(text.trim());
  const fail = (why) => { throw new Error(`Invalid KR spec "${text}": ${why}. Use "<min>..<max> higher|lower [target t]" or "auto higher|lower"`); };
  if (!m) fail('unrecognised format');
  const [, auto, min, max, dir, target] = m;
  const spec = { auto: Boolean(auto), min: Number(min), max: Number(max), lower: dir === 'lower', target: target === undefined ? null : Number(target) };
  if (spec.auto && spec.target !== null) fail('"auto" takes no target');
  if (!spec.auto && !(spec.min < spec.max)) fail('min must be below max');
  if (spec.target !== null && (spec.target <= spec.min || spec.target >= spec.max)) fail('target must lie strictly between min and max');
  return spec;
}

// Fraction of `xs` that x beats, ties counting half. The scale-free heart of every comparison.
function beatFraction(x, xs, lowerIsBetter) {
  let wins = 0;
  for (const y of xs) wins += x === y ? 0.5 : (lowerIsBetter ? x < y : x > y) ? 1 : 0;
  return wins / xs.length;
}

const clamp01 = (v) => Math.min(1, Math.max(0, v));

/**
 * Maps a raw score onto s ∈ [0, 1]. A range spec scales linearly, saturating at the target
 * ("good enough"); `auto` uses the percentile rank among the last 50 raw scores.
 * @param {number} raw The measured value (a rating, milliseconds, tests passed, ...).
 * @param {string} spec `<min>..<max> higher|lower [target t]` or `auto higher|lower`.
 * @param {number[]} [history] Previous raw scores for this KR (only `auto` uses them).
 * @returns {number} s in [0, 1]; with an empty history `auto` returns the neutral rank 0.5.
 */
export function normalize(raw, spec, history = []) {
  const p = parseSpec(spec);
  if (p.auto) return history.length ? beatFraction(raw, history.slice(-50), p.lower) : 0.5;
  if (p.lower) return clamp01((p.max - raw) / (p.max - (p.target ?? p.min)));
  return clamp01((raw - p.min) / ((p.target ?? p.max) - p.min));
}

/**
 * How often a challenger's score beats the champion's recent scores (up to 20), ties counting 0.5.
 * Scale-free: it works for ratings, latencies or test counts alike. Every learner consumes s as
 * this fractional win; a direct A/B pick is simply s ∈ {0, 1}.
 * @param {number} x The challenger's raw score.
 * @param {number[]} championSamples The champion's raw scores on the same KR.
 * @param {boolean} lowerIsBetter True for KRs like latency.
 * @returns {number} s in [0, 1].
 */
export function winRate(x, championSamples, lowerIsBetter) {
  if (!championSamples.length) throw new Error('winRate needs at least one champion sample');
  return beatFraction(x, championSamples.slice(-20), lowerIsBetter);
}

// --- Thompson sampling: try each challenger in proportion to the chance that it is the best. ---

// Standard normal draw (Box–Muller).
const gauss = (rand) => Math.sqrt(-2 * Math.log(1 - rand())) * Math.cos(2 * Math.PI * rand());

// Gamma(k, 1) draw (Marsaglia–Tsang), boosted for k < 1.
function gamma(k, rand) {
  if (k < 1) return gamma(k + 1, rand) * rand() ** (1 / k);
  const d = k - 1 / 3, c = 1 / Math.sqrt(9 * d);
  for (;;) {
    let x, v;
    do { x = gauss(rand); v = 1 + c * x; } while (v <= 0);
    v = v ** 3;
    if (Math.log(rand()) < 0.5 * x * x + d - d * v + d * Math.log(v)) return d * v;
  }
}

/**
 * Draws from Beta(a, b) as X / (X + Y) with X ~ Gamma(a), Y ~ Gamma(b).
 * @param {number} a Successes + 1 (posterior alpha).
 * @param {number} b Failures + 1 (posterior beta).
 * @param {() => number} rand Uniform generator, e.g. from `rng`.
 * @returns {number} A sample in (0, 1) with mean a / (a + b).
 */
export function betaSample(a, b, rand) {
  const x = gamma(a, rand);
  return x / (x + gamma(b, rand));
}

/**
 * Picks the challenger whose sampled win probability is highest. Posteriors update as
 * `a += s`, `b += 1 − s`, so promising challengers get tested more and weak ones fade.
 * @param {{id: string, a: number, b: number}[]} challengers
 * @param {() => number} rand
 * @returns {string} The chosen challenger's id.
 */
export function thompson(challengers, rand) {
  if (!challengers.length) throw new Error('thompson needs at least one challenger');
  let best = null, bestDraw = -1;
  for (const c of challengers) {
    const draw = betaSample(c.a, c.b, rand);
    if (draw > bestDraw) [best, bestDraw] = [c.id, draw];
  }
  return best;
}

// --- SPRT ratchet: keep a change only once the evidence says it really wins. ---

/**
 * One step of Wald's sequential probability ratio test: H0 "wins half the time" (p0) versus
 * H1 "wins more often" (p1), with a fractional observation s.
 * @param {number} llr The running log-likelihood ratio.
 * @param {number} s The latest win fraction in [0, 1].
 * @param {{p0?: number, p1?: number}} [opts]
 * @returns {number} The updated log-likelihood ratio.
 */
export function sprtStep(llr, s, { p0 = 0.5, p1 = 0.6 } = {}) {
  return llr + s * Math.log(p1 / p0) + (1 - s) * Math.log((1 - p1) / (1 - p0));
}

/**
 * Decides once the log-likelihood ratio crosses a Wald boundary. A challenger that never
 * decides is rejected at `cap` observations, so the ratchet never stalls.
 * @param {number} llr The running log-likelihood ratio.
 * @param {number} n Observations so far.
 * @param {{alpha?: number, beta?: number, cap?: number}} [opts] False-promote rate, false-reject rate, sample cap.
 * @returns {'promote' | 'reject' | 'continue'}
 */
export function sprt(llr, n, { alpha = 0.1, beta = 0.1, cap = 200 } = {}) {
  if (n >= cap) return 'reject';
  if (llr >= Math.log((1 - beta) / alpha)) return 'promote';
  if (llr <= Math.log(beta / (1 - alpha))) return 'reject';
  return 'continue';
}

// --- Q-learning: learn which kind of edit pays off, given the weakest KR and the fitness trend. ---

const Q_INIT = 0.5; // optimistic: untried directions look worth a try

/**
 * Chooses an edit direction with a Boltzmann (softmax) policy over Q-values.
 * Higher `tau` explores more; lower `tau` exploits the best-known direction.
 * @param {Record<string, Record<string, number>>} q Q-table: state → direction → value.
 * @param {string} state `${weakestKR}|${trend}`, trend ∈ {up, flat, down}.
 * @param {string[]} directions Allowed directions (from goals.md).
 * @param {number} tau Temperature, > 0.
 * @param {() => number} rand
 * @returns {string} The chosen direction.
 */
export function chooseDirection(q, state, directions, tau, rand) {
  const values = directions.map((d) => q[state]?.[d] ?? Q_INIT);
  const top = Math.max(...values);
  const weights = values.map((v) => Math.exp((v - top) / tau));
  let r = rand() * weights.reduce((sum, w) => sum + w, 0);
  for (let i = 0; i < directions.length; i++) if ((r -= weights[i]) < 0) return directions[i];
  return directions[directions.length - 1];
}

/**
 * Temporal-difference update: Q(s,a) += alpha · (r + gamma · max Q(s2,·) − Q(s,a)).
 * Reward is (challenger's mean s − 0.5) + (promoted ? 1 : −1). Unseen values start at 0.5.
 * @param {Record<string, Record<string, number>>} q
 * @param {string} s State when the edit was proposed.
 * @param {string} a The direction taken.
 * @param {number} r Reward.
 * @param {string} s2 State after the decision.
 * @param {{alpha?: number, gamma?: number}} [opts] Learning rate and discount.
 * @returns {Record<string, Record<string, number>>} A new Q-table (the input is not mutated).
 */
export function qUpdate(q, s, a, r, s2, { alpha = 0.2, gamma = 0.6 } = {}) {
  const next = Object.values(q[s2] ?? {});
  const target = r + gamma * (next.length ? Math.max(...next) : Q_INIT);
  const old = q[s]?.[a] ?? Q_INIT;
  return { ...q, [s]: { ...q[s], [a]: old + alpha * (target - old) } };
}

// --- CUSUM: notice when fitness stops climbing, so the explorer can widen its search. ---

/**
 * Cumulative-sum change detector over per-decision fitness deltas. A positive alarm means
 * fitness drifted up; no positive alarm for 5 decisions is a plateau (callers then raise tau).
 * @param {{pos?: number, neg?: number, sinceAlarm?: number}} state Previous detector state.
 * @param {number} dFitness Fitness change since the previous decision (0 on a rejection).
 * @param {{k?: number, h?: number}} [opts] Slack per step and alarm threshold.
 * @returns {{pos: number, neg: number, sinceAlarm: number, plateau: boolean, drift: 'up' | 'down' | null}}
 */
export function cusum({ pos = 0, neg = 0, sinceAlarm = 0 } = {}, dFitness, { k = 0.01, h = 0.05 } = {}) {
  pos = Math.max(0, pos + dFitness - k);
  neg = Math.max(0, neg - dFitness - k);
  let drift = null;
  if (pos > h) [pos, sinceAlarm, drift] = [0, 0, 'up'];
  else sinceAlarm += 1;
  if (neg > h) [neg, drift] = [0, 'down'];
  return { pos, neg, sinceAlarm, plateau: sinceAlarm >= 5, drift };
}

/**
 * Weighted mean of per-KR scores: Σ w·s / Σ w over the KRs that have data.
 * @param {Record<string, number>} perKrMeanS KR id → mean s.
 * @param {Record<string, number>} weights KR id → weight.
 * @returns {number} Fitness in [0, 1], or NaN when no KR has data yet.
 */
export function fitness(perKrMeanS, weights) {
  let num = 0, den = 0;
  for (const [id, s] of Object.entries(perKrMeanS)) {
    num += (weights[id] ?? 0) * s;
    den += weights[id] ?? 0;
  }
  return den ? num / den : NaN;
}

/**
 * Parses goals.md. Header lines are `key: value`; KR lines are `- id (w=N): spec`.
 * Blank lines and `#` comments are skipped; unknown header keys are kept as-is.
 * @param {string} text The contents of goals.md.
 * @returns {{keys: Record<string, string>, krs: {id: string, weight: number, spec: string}[]}}
 */
export function parseGoals(text) {
  const keys = {}, krs = [];
  for (const [i, raw] of text.split(/\r?\n/).entries()) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const kr = /^-\s*([\w-]+)\s*\(w=(\d*\.?\d+)\)\s*:\s*(.+)$/.exec(line);
    const kv = /^([\w-]+)\s*:\s*(.*)$/.exec(line);
    if (kr) {
      parseSpec(kr[3]);
      if (!(Number(kr[2]) > 0)) throw new Error(`goals.md line ${i + 1}: weight must be > 0`);
      krs.push({ id: kr[1], weight: Number(kr[2]), spec: kr[3].trim() });
    } else if (kv) keys[kv[1]] = kv[2].trim();
    else throw new Error(`goals.md line ${i + 1} not understood: "${line}". Use "key: value" or "- id (w=N): spec"`);
  }
  if (!krs.length) throw new Error('goals.md has no KRs. Add a line like "- quality (w=1): 0..10 higher target 8"');
  return { keys, krs };
}
