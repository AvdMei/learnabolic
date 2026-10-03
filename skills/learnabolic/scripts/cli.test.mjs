import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const CLI = fileURLToPath(new URL('./cli.mjs', import.meta.url));
const SOURCE = '---\nname: commit-message\ndescription: Writes commit messages.\n---\n# Commit messages\n\n- Use the imperative mood.\n';

const project = () => mkdtempSync(join(tmpdir(), 'learnabolic-'));
const cli = (cwd, ...args) => execFileSync(process.execPath, [CLI, ...args], { cwd, encoding: 'utf8' });
const state = (cwd, skill) => JSON.parse(readFileSync(join(cwd, '.learnabolic', skill, 'state.json'), 'utf8'));

test('a scripted agent learns, promotes, exports and forks the brain', () => {
  const cwd = project();
  writeFileSync(join(cwd, 'SKILL.md'), SOURCE);
  assert.match(cli(cwd, 'init', 'commit-message', '--from', 'SKILL.md', '--seed', '42'), /^INIT .*champion v0, generation 0/);

  // The "agent": follows USE, answers PROPOSE with a small edit, and a scorer that loves one edit.
  let proposals = 0, promoted = null;
  for (let i = 0; i < 600 && !promoted; i++) {
    const out = cli(cwd, 'pick', 'commit-message');
    const use = /^USE (\S+)$/m.exec(out)[1];
    const propose = /^PROPOSE (\S+): write (\S+) as a small edit of (v\d+).*then run: .* propose commit-message (v\d+) --direction (\S+)$/m.exec(out);
    if (propose) {
      const parent = readFileSync(join(cwd, '.learnabolic', 'commit-message', 'variants', `${propose[3]}.md`), 'utf8');
      writeFileSync(join(cwd, propose[2]), `${parent}- ${proposals++ === 0 ? 'GOOD: keep the subject under 50 chars' : `tweak ${propose[4]}`}\n`);
      assert.match(cli(cwd, 'propose', 'commit-message', propose[4], '--direction', propose[5]), /^OK v\d+/);
    }
    const value = readFileSync(join(cwd, use), 'utf8').includes('GOOD') ? 9 : 5;
    promoted = /^PROMOTED (v\d+) \(fitness \S+ → \S+\)$/m.exec(cli(cwd, 'score', 'commit-message', String(value)))?.[1];
  }
  assert.ok(promoted, 'expected a PROMOTED line');
  assert.match(readFileSync(join(cwd, '.learnabolic', 'commit-message', 'variants', `${promoted}.md`), 'utf8'), /GOOD/);

  const before = state(cwd, 'commit-message');
  assert.equal(before.generation, 1);
  assert.match(cli(cwd, 'status', 'commit-message'), /gen 1 · champion v\d+[\s\S]*img\.shields\.io\/badge\/learnabolic-gen%201/);
  assert.match(cli(cwd, 'export', 'commit-message'), /^EXPORTED learned\/commit-message\/SKILL\.md/);
  const exported = readFileSync(join(cwd, 'learned', 'commit-message', 'SKILL.md'), 'utf8');
  assert.match(exported, /^---\nname: commit-message\ndescription: Writes commit messages\.\n---\n# Commit messages[\s\S]*GOOD[\s\S]*```learnabolic\n/);

  const fork = project();
  mkdirSync(join(fork, 'vendor'));
  writeFileSync(join(fork, 'vendor', 'SKILL.md'), exported);
  assert.match(cli(fork, 'init', 'commit-message', '--from', 'vendor/SKILL.md'), /bootstrapped from brain/);
  const after = state(fork, 'commit-message');
  assert.deepEqual([after.generation, after.q, after.champion], [before.generation, before.q, before.champion]);
  assert.doesNotMatch(readFileSync(join(fork, '.learnabolic', 'commit-message', 'variants', `${after.champion}.md`), 'utf8'), /```learnabolic/);
});

test('errors are one clear line with a fix', () => {
  const cwd = project();
  writeFileSync(join(cwd, 'SKILL.md'), SOURCE);
  cli(cwd, 'init', 'demo', '--from', 'SKILL.md', '--seed', '1');
  const pick = cli(cwd, 'pick', 'demo');
  const id = /propose demo (v\d+)/.exec(pick)[1];
  writeFileSync(join(cwd, '.learnabolic', 'demo', 'variants', `${id}.md`), SOURCE.split('---\n')[2]);
  for (const args of [['propose', 'demo', id, '--direction', 'tighten'], ['score', 'demo', 'great'], ['pick', 'nope'], ['status', 'demo', '--kr', 'x']]) {
    const run = spawnSync(process.execPath, [CLI, ...args], { cwd, encoding: 'utf8' });
    assert.equal(run.status, 1);
    assert.match(run.stderr, /^ERROR: .+\. Fix: .+\n$/, args.join(' '));
  }
});
