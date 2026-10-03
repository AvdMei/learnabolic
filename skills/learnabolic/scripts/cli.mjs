#!/usr/bin/env node
// Learnabolic CLI. State lives in .learnabolic/<skill>/; every output tells the agent its next command.
import { readFileSync, writeFileSync, renameSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { rng, normalize, winRate, thompson, sprt, sprtStep, chooseDirection, qUpdate, cusum, fitness, parseGoals } from './core.mjs';

const CLI_PATH = fileURLToPath(import.meta.url);
const CLI_REL = relative(process.cwd(), CLI_PATH); // short when installed inside the project
const CLI_SHOWN = CLI_REL.startsWith('..') ? CLI_PATH : CLI_REL;
const RUN = `node ${/\s/.test(CLI_SHOWN) ? JSON.stringify(CLI_SHOWN) : CLI_SHOWN}`;
const TEMPLATE = join(dirname(CLI_PATH), '..', 'templates', 'goals.md');
const BRAIN = /\n*```learnabolic\n([\s\S]*?)\n```\n*/;
const MAX_CHALLENGERS = 3, WARMUP = 3, KEEP = 50, LEDGER_CAP = 500, TAU_BASE = 0.5, TAU_CAP = 4;

class Fail extends Error {}
const fail = (problem, fix) => { throw new Fail(`${problem}. Fix: ${fix}`); };

// --- Files: everything is plain text or JSON, written atomically. ---
const home = (skill) => join('.learnabolic', skill);
const variantPath = (skill, id) => join(home(skill), 'variants', `${id}.md`);
const read = (path) => readFileSync(path, 'utf8').replace(/\r\n/g, '\n');
function writeAtomic(path, text) {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.${process.pid}.tmp`;
  writeFileSync(tmp, text);
  renameSync(tmp, path);
}

function load(skill) {
  if (!existsSync(join(home(skill), 'state.json'))) fail(`"${skill}" is not tracked here`, `run: ${RUN} init ${skill} --from <path/to/SKILL.md>`);
  const state = JSON.parse(read(join(home(skill), 'state.json')));
  const goals = parseGoals(read(join(home(skill), 'goals.md')));
  const directions = (goals.keys.directions ?? '').split(',').map((d) => d.trim()).filter(Boolean);
  if (!directions.length) fail(`${home(skill)}/goals.md lists no directions`, 'add a line like "directions: tighten, add-example, prune"');
  return { state, goals, directions };
}
const save = (skill, state) => writeAtomic(join(home(skill), 'state.json'), `${JSON.stringify(state, null, 2)}\n`);

function log(state, event, fields) {
  state.ledger.push({ t: new Date().toISOString(), event, variant: null, direction: null, s: null, decision: null, fitness: null, ...fields });
  state.ledger = state.ledger.slice(-LEDGER_CAP);
}

// --- Derived numbers ---
const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
const fmt = (x) => (Number.isFinite(x) ? x.toFixed(2) : '—');
const newVariant = (status, parent, direction, qState) => ({ status, parent, direction, qState, a: 1, b: 1, llr: 0, n: 0, sSum: 0, raw: {} });
const challengers = (state) => Object.entries(state.variants).filter(([, v]) => v.status === 'challenger');
const sampleCount = (v) => Object.values(v.raw).reduce((n, xs) => n + xs.length, 0);
const pushCapped = (obj, key, x) => { obj[key] = [...(obj[key] ?? []), x].slice(-KEEP); };

// Mean normalized score per KR for one variant (only KRs it has been scored on).
function krMeans(v, state, goals) {
  const means = {};
  for (const kr of goals.krs) {
    const xs = v.raw[kr.id] ?? [];
    if (xs.length) means[kr.id] = mean(xs.map((x) => normalize(x, kr.spec, state.history[kr.id])));
  }
  return means;
}
const fitnessOf = (v, state, goals) => fitness(krMeans(v, state, goals), Object.fromEntries(goals.krs.map((kr) => [kr.id, kr.weight])));

// Q-learning state: the champion's weakest KR plus the recent fitness trend.
function qState(state, goals) {
  const means = Object.entries(krMeans(state.variants[state.champion], state, goals)).sort((x, y) => x[1] - y[1]);
  const [prev, last] = state.fitnessHistory.slice(-2);
  const trend = last === undefined ? 'flat' : last - prev > 0.01 ? 'up' : prev - last > 0.01 ? 'down' : 'flat';
  return `${means[0]?.[0] ?? goals.krs[0].id}|${trend}`;
}

// --- Commands ---
function init(skill, { from, seed }) {
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(skill)) fail(`invalid skill name "${skill}"`, 'use lowercase letters, digits and single hyphens, e.g. commit-message');
  if (existsSync(home(skill))) fail(`"${skill}" is already tracked in ${home(skill)}`, `run: ${RUN} status ${skill} (or delete that folder to start over)`);
  if (from && !existsSync(from)) fail(`${from} does not exist`, 'pass the path to the skill\'s SKILL.md');
  let frontmatter = `name: ${skill}\ndescription: ${skill}, learned with learnabolic.`, body = `# ${skill}\n`, brain = null;
  if (from) {
    const text = read(from), fm = /^---\n([\s\S]*?)\n---\n?/.exec(text);
    if (fm) frontmatter = fm[1];
    body = text.slice(fm ? fm[0].length : 0);
    const block = BRAIN.exec(body);
    if (block) {
      try { brain = JSON.parse(block[1]); } catch { fail(`the learnabolic brain block in ${from} is not valid JSON`, 'restore it from the original export or delete the block'); }
      if (brain.version !== 1 || !brain.lineage?.length) fail(`the brain in ${from} is not a version 1 brain with a lineage`, 're-export it with this CLI');
      body = `${body.replace(BRAIN, '\n').trimEnd()}\n`;
    }
  }
  const champion = brain ? brain.lineage.at(-1).id : 'v0';
  const state = {
    version: 1, skill, frontmatter, champion, seed: Number(seed ?? Date.now()) >>> 0,
    nextId: Math.max(...(brain?.lineage ?? [{ id: 'v0' }]).map((l) => Number(l.id.slice(1)))) + 1,
    generation: brain?.generation ?? 0, tau: TAU_BASE, cusum: {}, q: brain?.q ?? {},
    fitnessHistory: brain?.fitnessHistory ?? [], lineage: brain?.lineage ?? [{ id: 'v0', parent: null, direction: null, generation: 0 }],
    history: {}, variants: { [champion]: newVariant('champion', null, null, null) }, pending: null, lastPick: null, ledger: brain?.ledger ?? [],
  };
  writeAtomic(join(home(skill), 'goals.md'), read(TEMPLATE));
  writeAtomic(variantPath(skill, champion), body);
  log(state, 'init', { variant: champion });
  save(skill, state);
  return [
    `INIT ${home(skill)}: champion ${champion}, generation ${state.generation}${brain ? ' (bootstrapped from brain)' : ''}`,
    ...(from ? [] : [`EDIT ${variantPath(skill, champion)}: write the skill's instructions there`]),
    `GOALS ${home(skill)}/goals.md belongs to the user; ask them if the default 0..10 quality goal fits`,
    `NEXT: before each use of ${skill} run: ${RUN} pick ${skill}`,
  ];
}

function pick(skill) {
  const { state, goals, directions } = load(skill);
  const rand = rng(state.seed), champ = state.variants[state.champion], open = challengers(state);
  const serveChampion = !open.length || sampleCount(champ) < WARMUP || rand() < 0.5;
  const id = serveChampion ? state.champion : thompson(open.map(([cid, v]) => ({ id: cid, a: v.a, b: v.b })), rand);
  const out = [`USE ${variantPath(skill, id)}`];
  if (open.length < MAX_CHALLENGERS) {
    if (!state.pending) {
      const qs = qState(state, goals);
      state.pending = { id: `v${state.nextId++}`, parent: state.champion, direction: chooseDirection(state.q, qs, directions, state.tau, rand), qState: qs };
    }
    const p = state.pending;
    out.push(`PROPOSE ${p.direction}: write ${variantPath(skill, p.id)} as a small edit of ${p.parent} (weakest KR: ${p.qState.split('|')[0]}), then run: ${RUN} propose ${skill} ${p.id} --direction ${p.direction}`);
  }
  out.push(`AFTER USE: ${RUN} score ${skill} <value> [--kr ${goals.krs.map((kr) => kr.id).join('|')}]`);
  state.seed = Math.floor(rand() * 2 ** 32);
  state.lastPick = id;
  log(state, 'pick', { variant: id });
  save(skill, state);
  return out;
}

function propose(skill, id, { direction }) {
  const { state, goals, directions } = load(skill);
  if (!/^v\d+$/.test(id ?? '')) fail(`variant id must look like v7, got "${id}"`, `use the id printed by: ${RUN} pick ${skill}`);
  if (state.variants[id]) fail(`${id} is already registered`, `run: ${RUN} pick ${skill} to get a fresh id`);
  if (!directions.includes(direction)) fail(`unknown direction "${direction}"`, `pass --direction with one of: ${directions.join(', ')}`);
  const p = state.pending?.id === id ? state.pending : { parent: state.champion, qState: qState(state, goals) };
  if (!existsSync(variantPath(skill, id))) fail(`${variantPath(skill, id)} does not exist`, `write it as a small edit of ${p.parent}, then rerun this command`);
  if (read(variantPath(skill, id)).trim() === read(variantPath(skill, p.parent)).trim()) fail(`${id} is identical to ${p.parent}`, 'make a small but real edit, then rerun this command');
  state.variants[id] = newVariant('challenger', p.parent, direction, p.qState);
  if (state.pending?.id === id) state.pending = null;
  state.nextId = Math.max(state.nextId, Number(id.slice(1)) + 1);
  log(state, 'propose', { variant: id, direction });
  save(skill, state);
  return [`OK ${id} (${direction}) is now challenging ${state.champion}`, `NEXT: before the next use run: ${RUN} pick ${skill}`];
}

function score(skill, value, { kr, variant }) {
  const { state, goals } = load(skill);
  const raw = Number(value);
  if (value === undefined || value === '' || !Number.isFinite(raw)) fail(`score must be a number, got "${value}"`, `e.g. ${RUN} score ${skill} 8`);
  const id = variant ?? state.lastPick, v = state.variants[id];
  if (!v) fail(id ? `unknown variant ${id}` : 'nothing has been picked yet', `run: ${RUN} pick ${skill}`);
  if (!['champion', 'challenger'].includes(v.status)) fail(`${id} is ${v.status}, so its scores no longer count`, `run: ${RUN} pick ${skill}`);
  const k = kr ? goals.krs.find((x) => x.id === kr) : goals.krs[0];
  if (!k) fail(`unknown KR "${kr}"`, `use one of: ${goals.krs.map((x) => x.id).join(', ')} (from goals.md)`);
  const baseline = state.variants[state.champion].raw[k.id] ?? [];
  if (v.status === 'challenger' && !baseline.length) fail(`champion ${state.champion} has no "${k.id}" scores to compare against`, `score the champion on --kr ${k.id} first`);
  const s = v.status === 'champion' ? normalize(raw, k.spec, state.history[k.id]) : winRate(raw, baseline, / lower\b/.test(k.spec));
  pushCapped(v.raw, k.id, raw);
  pushCapped(state.history, k.id, raw);
  const out = [];
  if (v.status === 'champion') out.push(`OK ${id} (champion) s=${fmt(s)}`);
  else {
    Object.assign(v, { a: v.a + s, b: v.b + 1 - s, llr: sprtStep(v.llr, s), n: v.n + 1, sSum: v.sSum + s });
    const decision = sprt(v.llr, v.n);
    if (decision === 'continue') out.push(`OK ${id} s=${fmt(s)} (LLR ${fmt(v.llr)}, n ${v.n})`);
    else out.push(...decide(state, goals, id, decision === 'promote'));
  }
  log(state, 'score', { variant: id, direction: v.direction, s });
  save(skill, state);
  return [...out, `NEXT: before the next use run: ${RUN} pick ${skill}`];
}

// The ratchet: promote or reject a challenger, then teach the Q-table and the plateau detector.
function decide(state, goals, id, promoted) {
  const v = state.variants[id], before = fitnessOf(state.variants[state.champion], state, goals);
  if (promoted) {
    state.variants[state.champion].status = 'retired';
    for (const [, c] of challengers(state)) if (c !== v) c.status = 'superseded'; // they were edits of the old champion
    Object.assign(state, { champion: id, generation: state.generation + 1, tau: TAU_BASE, pending: null });
    v.status = 'champion';
    state.lineage.push({ id, parent: v.parent, direction: v.direction, generation: state.generation });
  } else v.status = 'rejected';
  const after = fitnessOf(state.variants[state.champion], state, goals);
  if (!state.fitnessHistory.length && Number.isFinite(before)) state.fitnessHistory.push(before); // the starting point
  state.q = qUpdate(state.q, v.qState, v.direction, v.sSum / v.n - 0.5 + (promoted ? 1 : -1), qState(state, goals));
  state.cusum = cusum(state.cusum, state.fitnessHistory.length ? after - state.fitnessHistory.at(-1) : 0);
  state.fitnessHistory = [...state.fitnessHistory, after].slice(-100);
  log(state, promoted ? 'promote' : 'reject', { variant: id, direction: v.direction, decision: promoted ? 'promote' : 'reject', fitness: after });
  const out = [promoted ? `PROMOTED ${id} (fitness ${fmt(before)} → ${fmt(after)})` : `REJECTED ${id}`];
  if (state.cusum.plateau) {
    state.tau = Math.min(state.tau * 1.5, TAU_CAP);
    out.push('PLATEAU: exploring more');
  }
  return out;
}

function status(skill) {
  const { state, goals } = load(skill);
  const champ = state.variants[state.champion], f = fitnessOf(champ, state, goals);
  const qs = qState(state, goals), arrow = { up: '↑', down: '↓', flat: '→' }[qs.split('|')[1]];
  const top = Object.entries(state.q[qs] ?? {}).sort((x, y) => y[1] - x[1]).slice(0, 3).map(([d, q]) => `${d} ${fmt(q)}`);
  const badge = (t) => encodeURIComponent(t.replace(/-/g, '--').replace(/_/g, '__'));
  const url = `https://img.shields.io/badge/learnabolic-${badge(`gen ${state.generation} · ${fmt(f)}${arrow}`)}-8a2be2`;
  return [
    `learnabolic · ${skill} · gen ${state.generation} · champion ${state.champion} (${sampleCount(champ)} samples) · fitness ${fmt(f)} ${arrow} · tau ${fmt(state.tau)}`,
    'challengers:',
    ...challengers(state).map(([id, v]) => `  ${id.padEnd(5)} ${v.direction.padEnd(22)} mean ${fmt(v.a / (v.a + v.b))}  LLR ${fmt(v.llr)}  n ${v.n}/200`),
    ...(challengers(state).length ? [] : ['  (none yet)']),
    `top directions in ${qs}: ${top.join(' · ') || '(none learned yet)'}`,
    `fitness trend: ${state.fitnessHistory.slice(-6).map(fmt).join(' → ') || '(no decisions yet)'}`,
    `badge: ![learnabolic](${url})`,
    `NEXT: before the next use run: ${RUN} pick ${skill}`,
  ];
}

function exportSkill(skill) {
  const { state } = load(skill);
  const fm = /^name:.*$/m.test(state.frontmatter) ? state.frontmatter.replace(/^name:.*$/m, `name: ${skill}`) : `name: ${skill}\n${state.frontmatter}`;
  const brain = { version: 1, generation: state.generation, q: state.q, fitnessHistory: state.fitnessHistory, lineage: state.lineage, ledger: '@ledger' };
  const rows = state.ledger.slice(-50).map((row) => `    ${JSON.stringify(row)}`).join(',\n'); // one row per line keeps the file short
  const json = JSON.stringify(brain, null, 2).replace('"@ledger"', `[\n${rows}\n  ]`);
  const out = join('learned', skill, 'SKILL.md');
  writeAtomic(out, `---\n${fm}\n---\n${read(variantPath(skill, state.champion)).trimEnd()}\n\n\`\`\`learnabolic\n${json}\n\`\`\`\n`);
  return [`EXPORTED ${out} (champion ${state.champion}, generation ${state.generation})`, `NEXT: push it to a repo as skills/${skill}/SKILL.md; others run: npx skills add <you>/<repo>, then: ${RUN} init ${skill} --from <installed SKILL.md>`];
}

// --- Entry point ---
const COMMANDS = {
  init: { flags: ['from', 'seed'], run: (p, f) => init(p[0], f) },
  pick: { flags: [], run: (p) => pick(p[0]) },
  score: { flags: ['kr', 'variant'], run: (p, f) => score(p[0], p[1], f) },
  propose: { flags: ['direction'], run: (p, f) => propose(p[0], p[1], f) },
  status: { flags: [], run: (p) => status(p[0]) },
  export: { flags: [], run: (p) => exportSkill(p[0]) },
};

function main([name, ...args]) {
  const cmd = COMMANDS[name];
  if (!cmd) fail(name ? `unknown command "${name}"` : 'no command given', `use one of: ${Object.keys(COMMANDS).join(', ')}, e.g. ${RUN} pick <skill>`);
  const positionals = [], flags = {};
  for (let i = 0; i < args.length; i++) {
    const flag = /^--([a-z]+)$/.exec(args[i])?.[1];
    if (!flag) positionals.push(args[i]);
    else if (!cmd.flags.includes(flag)) fail(`${name} does not take --${flag}`, `allowed: ${cmd.flags.map((x) => `--${x}`).join(' ') || 'none'}`);
    else if (args[i + 1] === undefined) fail(`--${flag} needs a value`, `e.g. --${flag} <value>`);
    else flags[flag] = args[++i];
  }
  if (!positionals[0]) fail(`${name} needs a skill name`, `e.g. ${RUN} ${name} commit-message`);
  console.log(cmd.run(positionals, flags).join('\n'));
}

try {
  main(process.argv.slice(2));
} catch (err) {
  console.error(`ERROR: ${err.message}`);
  if (!(err instanceof Fail)) console.error('This is unexpected; please report it with the command you ran.');
  process.exit(1);
}
