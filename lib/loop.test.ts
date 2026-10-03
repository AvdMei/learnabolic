import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createLoop, type View } from './loop.ts';
import { decodeBrain, encodeBrain, toSkillMd } from './share.ts';
import { sim } from '../envs/sim/index.ts';

const CLI = fileURLToPath(new URL('../skills/learnabolic/scripts/cli.mjs', import.meta.url));
const MAX_SPEED_10S = 2400; // batches the Lab runs at max speed in ~10 s (4 per frame × 60 fps)

async function run(weights?: Record<string, number>) {
  const loop = createLoop(sim, { seed: 7, weights });
  let v!: View<number[]>;
  loop.subscribe((x) => (v = x));
  const seen = { promote: 0, reject: 0, plateau: 0, first: NaN };
  for (let i = 0; i < MAX_SPEED_10S / 4; i++) {
    await loop.step(4);
    if (Number.isNaN(seen.first) && v.trace.length) seen.first = v.trace[0].f;
    if (v.plateau) seen.plateau++;
  }
  seen.promote = v.generation;
  seen.reject = loop.snapshot().ledger.filter((row) => row.event === 'reject').length;
  return { loop, v, seen };
}

// Default weights are Correct 1 · Fast 1 · Cheap 0.5 (the user chose this over equal weights; see envs/sim).
test('sim learns at max speed: rises from ~0.4, promotes, rejects, plateaus', async () => {
  const { v, seen } = await run();
  assert.ok(seen.first > 0.3 && seen.first < 0.52, `start fitness ${seen.first}`);
  assert.ok(v.fitness > 0.6, `end fitness ${v.fitness}`);
  assert.ok(v.generation >= 3 && seen.promote > 0 && seen.reject > 0 && seen.plateau > 0, JSON.stringify(seen));
});

test('raising Cheap steers later promotions toward fewer tokens', async () => {
  const tokens = (p: number[]) => Array.from({ length: 200 }, (_, s) => sim.episode(p, s * 104729).cheap).reduce((a, b) => a + b) / 200;
  const base = (await run()).v, cheap = (await run({ correct: 1, fast: 1, cheap: 4 })).v;
  assert.notDeepEqual(cheap.champion, base.champion);
  assert.ok(tokens(cheap.champion) < tokens(base.champion), `${tokens(cheap.champion)}k vs ${tokens(base.champion)}k tokens`);
});

test('a share link round-trips, and the SKILL.md download bootstraps the CLI', async () => {
  const { loop } = await run();
  const brain = loop.snapshot();
  assert.deepEqual(await decodeBrain(await encodeBrain(brain)), brain);
  const fork = createLoop(sim, { seed: 1 });
  fork.restore(await decodeBrain(await encodeBrain(brain)));
  assert.deepEqual({ ...fork.snapshot(), ledger: [] }, { ...brain, ledger: [] });
  await assert.rejects(decodeBrain('not-a-brain'), /damaged/);

  const cwd = mkdtempSync(join(tmpdir(), 'learnabolic-lab-'));
  mkdirSync(join(cwd, 'dl'));
  writeFileSync(join(cwd, 'dl', 'SKILL.md'), toSkillMd(sim, brain));
  assert.match(execFileSync(process.execPath, [CLI, 'init', 'sim', '--from', 'dl/SKILL.md'], { cwd, encoding: 'utf8' }), /bootstrapped from brain/);
  const state = JSON.parse(readFileSync(join(cwd, '.learnabolic', 'sim', 'state.json'), 'utf8'));
  assert.deepEqual([state.generation, state.champion, state.q], [brain.generation, brain.lineage.at(-1)!.id, brain.q]);
});
