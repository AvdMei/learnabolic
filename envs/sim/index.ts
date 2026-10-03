import { rng } from '../../skills/learnabolic/scripts/core.mjs';
import type { Env } from '../../lib/env.ts';

// Correct, Fast, Cheap: pick two. A policy is six habit strengths; a hidden relevance matrix trades the KRs off.
const HABITS = [
  'Write a failing test first',
  'Read the whole file before editing',
  'Reuse existing helpers',
  'Answer in one pass, skip re-checks',
  'Keep diffs small',
  'Run the full test suite after each change',
];
const KRS = ['correct', 'fast', 'cheap'] as const;
const BASE = { correct: 0.4, fast: 0.47, cheap: 0.38 };
// Every habit costs something somewhere, so no policy maxes all three KRs.
const M: Record<(typeof KRS)[number], number[]> = {
  correct: [0.3, 0.2, -0.1, -0.3, 0.1, 0.3],
  fast: [-0.2, -0.05, 0.2, 0.35, -0.15, -0.35],
  cheap: [-0.1, -0.25, 0.15, 0.3, 0.2, -0.15],
};
const SCALE = { correct: (q: number) => 45 * q, fast: (q: number) => 2000 * (1 - q), cheap: (q: number) => 20 * (1 - q) };

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const argmin = (xs: number[]) => xs.indexOf(Math.min(...xs));
function hash(text: string) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}

export const sim: Env<number[]> = {
  id: 'sim',
  title: 'Correct, Fast, Cheap',
  pitch: 'An agent writing code is judged on Correct, Fast and Cheap. Pick two.',
  goals: [
    { id: 'correct', label: 'Correct', weight: 1, spec: '0..45 higher target 42' },
    { id: 'fast', label: 'Fast', weight: 1, spec: '0..2000 lower target 500' },
    { id: 'cheap', label: 'Cheap', weight: 0.5, spec: '0..20 lower target 2' }, // pick two: Cheap starts low, so dragging it up steers
  ],
  directions: ['tighten', 'add-example', 'prune', 'reorder', 'explore', 'emphasize-weakest-kr'],
  seed: [0.5, 0.9, 0, 0, 0, 0.9], // over-cautious: fitness ≈ 0.44 at default weights; ≈ 0.70 learned, ≈ 0.82 with Cheap at 4

  toText: (p) => `# Coding habits\n\nStrength 0–1: how often the agent does it.\n\n${HABITS.map((h, i) => `- ${h} (${p[i].toFixed(2)})`).join('\n')}\n`,
  fromText(text) {
    const p = HABITS.map((h) => Number(new RegExp(`^- ${h} \\((\\d(?:\\.\\d+)?)\\)$`, 'm').exec(text)?.[1] ?? NaN));
    return p.every((x) => x >= 0 && x <= 1) ? p : null;
  },

  // Raw scores: tests passed of 45, latency in ms, thousands of tokens. Habit noise is shared per seed (common random numbers).
  episode(p, seed) {
    const rand = rng(seed), noise = () => (rand() + rand() + rand() - 1.5) * 2;
    const eps = p.map(noise);
    const out: Record<string, number> = {};
    for (const k of KRS) out[k] = SCALE[k](clamp01(BASE[k] + 0.05 * noise() + p.reduce((q, x, i) => q + M[k][i] * x * (1 + 0.6 * eps[i]), 0)));
    return out;
  },

  // One deterministic mutation per direction; returns null when the edit would change nothing.
  async propose(p, direction, summary) {
    const rand = rng(hash(`${direction}|${p.join()}|${Object.values(summary.means).join()}`));
    const x = [...p], pick = () => Math.floor(rand() * x.length);
    if (direction === 'tighten') x[pick()] += rand() < 0.5 ? -0.1 : 0.1;
    else if (direction === 'add-example') {
      const off = x.flatMap((v, i) => (v < 0.05 ? [i] : []));
      const i = off.length ? off[Math.floor(rand() * off.length)] : pick();
      x[i] = Math.max(x[i], 0.5);
    } else if (direction === 'prune') x[argmin(x.map((v, i) => (v > 0 ? v * KRS.reduce((t, k) => t + M[k][i], 0) : Infinity)))] = 0;
    else if (direction === 'reorder') {
      const [i, j] = [pick(), pick()];
      [x[i], x[j]] = [x[j], x[i]];
    } else if (direction === 'explore') {
      x[pick()] = rand();
      x[pick()] = rand();
    } else if (direction === 'emphasize-weakest-kr') {
      const means = Object.entries(summary.means).sort((a, b) => a[1] - b[1]);
      const k = (means[0]?.[0] ?? 'correct') as (typeof KRS)[number];
      x[M[k].indexOf(Math.max(...M[k]))] += 0.15;
    } else throw new Error(`sim: unknown direction "${direction}"`);
    const next = x.map((v) => Math.round(clamp01(v) * 100) / 100);
    return next.join() === p.join() ? null : next;
  },
};
