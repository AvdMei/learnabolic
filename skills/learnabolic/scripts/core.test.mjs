import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as core from './core.mjs';
import { rng, normalize, winRate, betaSample, thompson, sprt, sprtStep, chooseDirection, qUpdate, cusum, fitness, parseGoals } from './core.mjs';

test('exports exactly the public API', () => {
  assert.deepEqual(Object.keys(core).sort(), ['betaSample', 'chooseDirection', 'cusum', 'fitness', 'normalize', 'parseGoals', 'qUpdate', 'rng', 'sprt', 'sprtStep', 'thompson', 'winRate']);
});

test('rng is deterministic per seed', () => {
  const a = rng(7), b = rng(7);
  assert.deepEqual([a(), a(), a()], [b(), b(), b()]);
});

test('normalize handles higher, lower, target and auto', () => {
  assert.equal(normalize(5, '0..10 higher'), 0.5);
  assert.equal(normalize(9, '0..10 higher target 8'), 1);
  assert.equal(normalize(4, '0..10 higher target 8'), 0.5);
  assert.equal(normalize(250, '0..1000 lower'), 0.75);
  assert.equal(normalize(500, '0..2000 lower target 500'), 1);
  assert.equal(normalize(1250, '0..2000 lower target 500'), 0.5);
  assert.equal(normalize(3, 'auto higher', [1, 2, 4, 5]), 0.5);
  assert.equal(normalize(6, 'auto higher', [1, 2, 4, 5]), 1);
  assert.equal(normalize(6, 'auto lower', [1, 2, 4, 5]), 0);
  assert.equal(normalize(6, 'auto higher', []), 0.5);
  assert.throws(() => normalize(1, '10..0 higher'), /min must be below max/);
});

test('winRate counts ties as half and respects direction', () => {
  assert.equal(winRate(5, [4, 5, 6, 7], false), 0.375);
  assert.equal(winRate(5, [4, 5, 6, 7], true), 0.625);
  assert.throws(() => winRate(1, [], false));
});

test('betaSample mean is close to a / (a + b)', () => {
  const rand = rng(1);
  for (const [a, b] of [[2, 5], [0.5, 0.5], [30, 10]]) {
    let sum = 0;
    for (let i = 0; i < 20000; i++) sum += betaSample(a, b, rand);
    assert.ok(Math.abs(sum / 20000 - a / (a + b)) < 0.01, `Beta(${a}, ${b})`);
  }
});

test('thompson prefers the challenger with the stronger posterior', () => {
  const rand = rng(3), counts = { strong: 0, weak: 0 };
  for (let i = 0; i < 1000; i++) counts[thompson([{ id: 'strong', a: 20, b: 5 }, { id: 'weak', a: 5, b: 20 }], rand)]++;
  assert.ok(counts.strong > 950);
});

const runSprt = (s) => {
  let llr = 0;
  for (let n = 1; ; n++) {
    llr = sprtStep(llr, s);
    const decision = sprt(llr, n);
    if (decision !== 'continue') return { decision, n };
  }
};

test('SPRT promotes on 0.8s, rejects on 0.3s, and rejects at the cap', () => {
  assert.equal(runSprt(0.8).decision, 'promote');
  assert.equal(runSprt(0.3).decision, 'reject');
  assert.deepEqual(runSprt(0.55), { decision: 'reject', n: 200 });
});

test('CUSUM flags a plateau on a flat series and resets on a climb', () => {
  let state = {};
  for (let i = 0; i < 5; i++) state = cusum(state, 0);
  assert.equal(state.plateau, true);
  state = cusum(state, 0.1);
  assert.deepEqual([state.plateau, state.drift], [false, 'up']);
});

test('Q-learning converges toward the direction with the higher reward', () => {
  const rand = rng(11), directions = ['tighten', 'prune', 'explore'];
  const reward = { tighten: 1.2, prune: -0.8, explore: -0.6 };
  let q = {};
  for (let i = 0; i < 300; i++) {
    const d = chooseDirection(q, 'quality|flat', directions, 0.5, rand);
    q = qUpdate(q, 'quality|flat', d, reward[d], 'quality|flat');
  }
  const best = directions.reduce((x, y) => (q['quality|flat'][x] > q['quality|flat'][y] ? x : y));
  assert.equal(best, 'tighten');
});

test('fitness is the weighted mean over KRs with data', () => {
  assert.ok(Math.abs(fitness({ quality: 0.8, speed: 0.2 }, { quality: 3, speed: 1 }) - 0.65) < 1e-12);
  assert.ok(Number.isNaN(fitness({}, { quality: 1 })));
});

const GOALS = `north-star: Do the task the way this user actually wants it.
directions: tighten, add-example, prune
owner: someone-later
# a comment
- quality (w=1): 0..10 higher target 8
- speed (w=0.3): 0..2000 lower target 500
- tests (w=0.5): auto higher
`;

test('parseGoals round-trips and preserves unknown keys', () => {
  const goals = parseGoals(GOALS);
  assert.equal(goals.keys.owner, 'someone-later');
  assert.deepEqual(goals.krs[1], { id: 'speed', weight: 0.3, spec: '0..2000 lower target 500' });
  const text = Object.entries(goals.keys).map(([k, v]) => `${k}: ${v}`)
    .concat(goals.krs.map((kr) => `- ${kr.id} (w=${kr.weight}): ${kr.spec}`)).join('\n');
  assert.deepEqual(parseGoals(text), goals);
  assert.throws(() => parseGoals('- bad (w=1): fast please'), /Invalid KR spec/);
});
