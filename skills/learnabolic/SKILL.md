---
name: learnabolic
description: Makes any agent skill learn and improve from feedback. Use whenever the user wants a skill, prompt or agent behaviour to get better over time from ratings, thumbs up/down, accepted-or-edited outputs, tests passed, latency or any other measurable score; when they say "learn from my feedback", "improve this skill", "track this skill" or "self-improving"; and before using any skill that has a .learnabolic/<skill>/ folder.
license: MIT
compatibility: Requires Node.js >= 20 and an agent that can run shell commands. No API key, no network.
metadata:
  author: Age van der Mei
  version: "0.1.0"
---

# Learnabolic

You propose small edits to a skill; statistics decide which ones survive. `CLI` below means
`node <this skill's folder>/scripts/cli.mjs`. Run it from the project root. Every output line ends
with the exact next command, so follow the output.

1. **Track a skill:** `CLI init <skill> --from <path/to/its/SKILL.md>`.
2. **Before using a tracked skill** (one with a `.learnabolic/<skill>/` folder), run `CLI pick <skill>`
   and follow the variant file it prints after `USE`, instead of the skill's own body.
3. **After using it, report one score:** `CLI score <skill> <value> [--kr id]`. The value can be:
   - a user rating on the KR's scale in `.learnabolic/<skill>/goals.md` (ask sparingly, at most once per task);
   - implicit: output accepted unchanged = the top of the scale, heavily edited = the bottom;
   - any number you measure yourself (milliseconds, tests passed) with `--kr <id>`.
4. **When the output says `PROPOSE <direction>`:** copy the parent variant to the exact path it prints
   and make one **small delta edit** in that direction, aimed at the `north-star` in `goals.md`. Then
   run the exact command it prints. Never rewrite the whole thing, and never edit `goals.md`.
   Directions: `tighten` (clearer, fewer words), `add-example`, `prune` (drop a rule that doesn't
   help), `reorder` (most important first), `explore` (try one new idea), `emphasize-weakest-kr`.
5. **Relay** any `PROMOTED`, `REJECTED` or `PLATEAU` line to the user in one sentence.

`CLI status <skill>` shows progress; `CLI export <skill>` writes the best version to
`learned/<skill>/SKILL.md`. On an `ERROR:` line, apply the fix it names.
