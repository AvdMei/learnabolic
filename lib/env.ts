import type { FC } from 'react';

// The Env contract: anything with KRs, a policy that renders as SKILL.md text and a scored episode can learn.
export type KR = { id: string; label: string; weight: number; spec: string }; // spec: core.mjs grammar, fed to normalize
export type Summary = { means: Record<string, number>; worst: Record<string, number>[] }; // champion's mean s and worst episodes
export interface Env<P> {
  id: string;
  title: string;
  pitch: string;
  goals: KR[];
  directions: string[];
  seed: P; // starting policy (deliberately weak)
  toText(p: P): string; // SKILL.md-style text: policy panel, diff, export
  fromText(t: string): P | null; // share links
  episode(p: P, seed: number): Record<string, number>; // raw score per KR; pure, seeded, fast
  propose(p: P, direction: string, summary: Summary): Promise<P | null>; // may be async (LLM later)
  ratchet?: 'sprt'; // reserved: future envs add other modes
  Viewer?: FC<{ champion: P; challenger?: P; seed: number; speed: number }>;
}
