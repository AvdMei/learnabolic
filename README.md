# Learnabolic

**Metabolize feedback into skill. Give any agent recursive self-improvement.**

![Learnabolic learning loop](docs/hero.gif)

Your agent already has skills. Learnabolic makes them get better every time you use them. The agent
writes small edits to a skill, and about 150 lines of dependency-free statistics decide which edits survive.
No API key, no model, no server. Just a skill and a `.learnabolic/` folder.

## Install

```bash
npx skills add AvdMei/learnabolic
```

One agent only (`-a`), or for every project on your machine (`-g`):

```bash
npx skills add AvdMei/learnabolic -a claude-code
```

```bash
npx skills add AvdMei/learnabolic -g
```

Works with every agent the [skills CLI](https://github.com/vercel-labs/skills#supported-agents) supports,
including `claude-code`, `codex`, `cursor`, `github-copilot`, `gemini-cli`, `opencode`, `cline`, `windsurf`,
`roo`, `goose`, `kiro-cli` and `openhands`. You need **Node ≥ 20** and an agent that can run shell commands.

## 60-second quick start

Say to your agent:

> *"Track my `commit-message` skill with learnabolic and learn from my ratings."*

Here is what happens (real CLI output; the agent runs the commands, you only give the ratings):

```text
$ node .claude/skills/learnabolic/scripts/cli.mjs init commit-message --from .claude/skills/commit-message/SKILL.md
INIT .learnabolic/commit-message: champion v0, generation 0

$ node .claude/skills/learnabolic/scripts/cli.mjs pick commit-message
USE .learnabolic/commit-message/variants/v0.md
PROPOSE tighten: write .learnabolic/commit-message/variants/v1.md as a small edit of v0 (weakest KR: quality), then run: node .claude/skills/learnabolic/scripts/cli.mjs propose commit-message v1 --direction tighten
AFTER USE: node .claude/skills/learnabolic/scripts/cli.mjs score commit-message <value> [--kr quality]

  … the agent writes your commit message following v0; you rate it 6/10 …

$ node .claude/skills/learnabolic/scripts/cli.mjs score commit-message 6
OK v0 (champion) s=0.75

  … the agent adds one line to a copy of v0: "Keep the subject line under 50 characters." …

$ node .claude/skills/learnabolic/scripts/cli.mjs propose commit-message v1 --direction tighten
OK v1 (tighten) is now challenging v0

  … 33 commits later, v1 keeps beating v0 …

$ node .claude/skills/learnabolic/scripts/cli.mjs score commit-message 9
PROMOTED v1 (fitness 0.75 → 1.00)
```

From then on, v1 is the skill your agent follows, and it starts proposing the next edit.

## How it works

**The LLM proposes, statistics disposes.** Your agent is good at writing a plausible small edit, but bad at
judging whether that edit actually helped you. So each job goes to the part that is good at it. The agent
writes small delta edits in a direction the CLI chooses. The CLI serves the current best version (the
*champion*) about half the time and the challengers the rest of the time, compares their scores and only
promotes a challenger once the evidence is in. A failed edit costs a few mediocre uses, never a regression.

```text
        ┌──────────────────────────────────────────────────────┐
        ▼                                                      │
   pick ──► use ──► score ──► propose ──► ratchet ─────────────┘
 champion   follow    👍, 0–10,  agent writes  SPRT: promote,
 or Thompson the      ms, tests  a small edit  reject or wait;
 challenger variant   …          in a Q-chosen Q learns which
                                 direction     directions pay
```

## Any score

Each key result (KR) in `goals.md` says what the numbers mean. Score with `score <skill> <value> [--kr id]`.

| Signal | `goals.md` line | Score it with |
|---|---|---|
| 👍 / 👎 | `- thumbs (w=1): 0..1 higher` | `score x 1` or `score x 0` |
| 0–10 rating | `- quality (w=1): 0..10 higher target 8` | `score x 7` |
| Latency in ms | `- speed (w=0.3): 0..2000 lower target 500` | `score x 840 --kr speed` |
| Tests passed | `- tests (w=0.5): auto higher` | `score x 41 --kr tests` |
| Conversion % | `- conversion (w=1): 0..10 higher target 4` | `score x 3.2 --kr conversion` |
| Accepted vs. edited | `- quality (w=1): 0..10 higher target 8` | accepted as-is `10`, heavily edited `0` |

## The math, honestly

- **Score adapter:** a raw value becomes s ∈ [0, 1] by its range (saturating at `target`) or, with `auto`, by
  percentile rank among the last 50 scores. Challengers are scored by **win rate** against the champion's
  last 20 scores (ties count ½), so any scale works.
- **Thompson sampling:** each challenger has a Beta(a, b) posterior (`a += s`, `b += 1 − s`); the one with the
  highest random draw gets the next use, so promising edits get tested more.
- **Q-learning on directions:** the state is *weakest KR × fitness trend*; a Boltzmann policy picks the edit
  direction, and the reward is the challenger's mean win rate minus ½, plus 1 if promoted or −1 if rejected.
- **SPRT ratchet:** Wald's sequential test of "wins 60%" against "wins 50%" (α = β = 0.1) promotes or rejects
  as soon as the evidence is sufficient, and rejects anything still undecided after 200 scores.
- **CUSUM:** detects when fitness stops climbing (no upward alarm in 5 decisions) and raises the policy
  temperature so the agent explores bolder directions.
- **Why no LLM judge?** A model grading its own edits rewards what sounds good to a model. Your scores
  measure what is good for you, and the statistics make sure one lucky score never counts as progress.

All of it lives in [`core.mjs`](skills/learnabolic/scripts/core.mjs): pure functions, a seeded RNG and one
comment per concept, so you can read it in ten minutes.

## `goals.md`

`init` copies this into `.learnabolic/<skill>/goals.md`. It is **yours**: the CLI reads it but never writes it,
and the agent is told never to edit it.

```text
north-star: Do the task the way this user actually wants it.
directions: tighten, add-example, prune, reorder, explore, emphasize-weakest-kr
- quality (w=1): 0..10 higher target 8
```

- `north-star`: what every edit should serve.
- `directions`: the kinds of edit the agent may make; Q-learning learns which ones pay off for this skill.
- KR lines: `- <id> (w=<weight>): <min>..<max> higher|lower [target <t>]` or `- <id> (w=<weight>): auto higher|lower`.
  Fitness is the weighted mean of the KRs. The first KR is the default for `score`.

## CLI reference

`CLI` is `node <skill folder>/scripts/cli.mjs`. Run it from your project root.

| Command | Example |
|---|---|
| `init <skill> [--from SKILL.md]` | `CLI init commit-message --from .claude/skills/commit-message/SKILL.md` |
| `pick <skill>` | `CLI pick commit-message` → `USE …/v3.md` (+ `PROPOSE …` when there's room for a challenger) |
| `score <skill> <value> [--kr id] [--variant vN]` | `CLI score commit-message 8` → `OK`, `PROMOTED`, `REJECTED` or `PLATEAU` |
| `propose <skill> vN --direction d` | `CLI propose commit-message v7 --direction prune` |
| `status <skill>` | `CLI status commit-message` → champion, challengers, top directions, fitness trend, badge |
| `export <skill>` | `CLI export commit-message` → `learned/commit-message/SKILL.md` |

Every output ends with the exact next command. Errors are one line: `ERROR: <problem>. Fix: <what to do>`.

## A brain is just a SKILL.md

`export` writes the champion as a normal, installable skill: the original frontmatter, the learned body and a
fenced `learnabolic` block with the brain (generation, Q-table, fitness history, lineage, last 50 events).

1. `CLI export commit-message`
2. Push `learned/commit-message/SKILL.md` to a repo as `skills/commit-message/SKILL.md`.
3. Anyone runs `npx skills add you/repo`. It works as a plain skill straight away.
4. With learnabolic installed, `CLI init commit-message --from <installed SKILL.md>` resumes from your brain:
   same generation, same Q-table, and it keeps learning from their feedback.

Show it off with the badge `status` prints:

```markdown
![learnabolic](https://img.shields.io/badge/learnabolic-gen%207%20%C2%B7%200.68%E2%86%91-8a2be2)
```

## FAQ

**Why no API key?** The skill makes no model calls. Your agent *is* the LLM; learnabolic is only the
statistics. Nothing leaves your machine.

**Where is state stored, and should I commit `.learnabolic/`?** In `.learnabolic/<skill>/`: `goals.md`, the
variants as Markdown and `state.json`, all written atomically. Commit it if you want a team to share one
learning history. Otherwise ignore it and commit `export`ed milestones.

**How much feedback does it need?** It depends on how clear the win is. An edit that wins almost every time
is promoted after about 13 challenger scores (roughly 30 uses). One that wins 65% of the time needs about 55.
A neutral edit is rejected after about 100. Implicit and measured scores cost you nothing, so use them
where you can.

**What stops it from gaming the score?** You own `goals.md` and the agent may not edit it. Edits are small
deltas of the champion, never rewrites, and an edit is only kept once it beats the champion on your scores
with statistical confidence.

## Inspirations

- **Memento**: soft Q-learning over memory while the LLM stays frozen.
- **ACE** (Agentic Context Engineering): delta edits to context instead of full rewrites.
- **[karpathy/autoresearch](https://github.com/karpathy/autoresearch)**: the keep-or-revert ratchet.

## License

[MIT](LICENSE) © Age van der Mei
