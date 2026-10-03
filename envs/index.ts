import type { Env } from '../lib/env.ts';
import { sim } from './sim/index.ts';

// IMPORTANT: a policy only ever flows back into the env that made it, so erasing P here is safe. Never mix envs' policies.
const erase = <P,>(env: Env<P>) => env as unknown as Env<unknown>;

// The registry: a new env is a folder in envs/ plus one line here. The Lab picker and "Coming next" read it.
export const envs: Record<string, Env<unknown>> = {
  sim: erase(sim),
};
