import Link from 'next/link';
import { CopyCommand } from '@/components/CopyCommand';
import { LabTeaser, ShareBrainLink } from '@/components/Lab';
import { HeroGen, HeroTrace, InstrumentCards, SteeringDemo } from '@/components/LiveLandingWidgets';
import { ProposeDisposeStage } from '@/components/ProposeDisposeStage';
import { Reel } from '@/components/Reel';
import { ScoreMorph, SCORES } from '@/components/ScoreMorph';
import { Section, Window } from '@/components/Section';
import { envs } from '@/envs/index';
import { sim } from '@/envs/sim/index';
import { createLoop } from '@/lib/loop';
import { toSkillMd } from '@/lib/share';
import { GITHUB, INSTALL, ISSUES } from '@/lib/siteLinks';
import { LiveProvider } from '@/lib/useLiveLoop';

const NEXT = [
  { id: 'touchdown', title: 'Touchdown', line: 'A model that never sees the game writes a lander autopilot, and learns from scores alone.' },
  { id: 'autoresearch', title: 'Ratcheted autoresearch', line: "Karpathy's overnight loop, with noise-aware keeps and a learned research taste." },
];
const CONTROL = ['Goal', 'setpoint', 'Score', 'sensor', 'Gap', 'error', 'Direction', 'controller', 'Small edit', 'actuator'];

// A real brain, learned by the sim at build time and exported exactly like `cli export`.
async function learnedSkillMd() {
  const loop = createLoop(sim, { seed: 7 });
  await loop.step(300);
  return toSkillMd(sim, loop.snapshot()).split('```learnabolic');
}

export default async function Home() {
  const [skillBody, brainBlock] = await learnedSkillMd();
  return (
    <LiveProvider envId="sim">
      <main>
        <section className="section hero paper" aria-labelledby="hero-title">
          <HeroTrace />
          <div className="hero-copy">
            <h1 className="display" id="hero-title">Learnabolic</h1>
            <p className="hero-sub display">skill that gives AI agents self-improvement</p>
            <p className="hero-line cursor">Your 👍 is the gradient.</p>
            <CopyCommand command={INSTALL} />
            <p className="hero-cta"><Link className="btn btn-primary" href="/lab">Watch it learn →</Link> <a className="btn" href={GITHUB}>GitHub</a></p>
            <p className="kicker">No API key. No model. ~150 lines of math.</p>
            <HeroGen />
          </div>
        </section>

        <Section n={2} kicker="the problem">
          <ul className="problem display"><li>Agents forget what worked.</li><li>Every session starts from zero.</li><li>Fine-tuning is out of reach. Prompt tweaking is guesswork.</li></ul>
        </Section>

        <Section n={3} kicker="the idea" title="The LLM proposes, statistics disposes.">
          <ProposeDisposeStage />
        </Section>

        <Section n={4} kicker="any score" title="If you can measure it, or rate it, learnabolic can use it to improve your agent.">
          <ScoreMorph />
          <Window title="goals.md"><pre className="policy">{SCORES.map((s) => s.line).join('\n')}</pre></Window>
        </Section>

        <Section n={5} kicker="the four instruments" title="Counting, not judging.">
          <InstrumentCards />
          <p className="muted">Why no LLM judge? Judges drift, flatter and cost tokens. Counting doesn&apos;t.</p>
        </Section>

        <Section n={6} kicker="goals steer" title="Goals steer; humans own the North Star.">
          <svg className="control" viewBox="0 0 1000 90" role="img" aria-label="Control loop: goal (setpoint), score (sensor), gap (error), direction (controller), small edit (actuator), back to score.">
            <path d="M40 40 H960 V78 H40 Z" />
            {[0, 1, 2, 3, 4].map((i) => (
              <g key={i} transform={`translate(${100 + i * 200} 40)`}>
                <rect x={-78} y={-24} width={156} height={34} />
                <text y={-3} textAnchor="middle">{CONTROL[2 * i]}</text>
                <text y={34} textAnchor="middle" className="control-role">{CONTROL[2 * i + 1]}</text>
              </g>
            ))}
          </svg>
          <SteeringDemo />
        </Section>

        <Section n={7} kicker="live lab" title="Watch it learn, live.">
          <p className="caption">Pick two: Correct, Fast, Cheap. Then watch it learn your taste.</p>
          <LabTeaser />
          <p><Link className="btn" href="/lab">Open the full Lab →</Link></p>
        </Section>

        <Section n={8} kicker="portable brains" title="A brain is just a SKILL.md.">
          <Window title="learned/sim/SKILL.md">
            <pre className="skillmd"><code>{skillBody}</code><code className="glow">```learnabolic{brainBlock}</code></pre>
          </Window>
          <ol className="steps"><li><code>cli export</code></li><li>push to GitHub</li><li><code>npx skills add you/your-brain</code></li></ol>
          <p>It keeps learning from where you left off. <ShareBrainLink /></p>
        </Section>

        <Section n={9} kicker="use it in 60 seconds" title="Install. Tell your agent. Score things.">
          <ol className="steps">
            <li><CopyCommand command={INSTALL} /></li>
            <li><em>&ldquo;tell your agent: track my commit-message skill with learnabolic&rdquo;</em></li>
            <li>score things: 👍, 0–10, ms, tests passed</li>
          </ol>
          <p className="caption">A real run, replayed. You only rate; the statistics decide.</p>
          <Reel />
        </Section>

        <Section n={10} kicker="coming next" title="More worlds to learn in.">
          <div className="cards2">
            {NEXT.map((c) => {
              const live = Boolean(envs[c.id]);
              return (
                <Window key={c.id} title={`envs/${c.id}`}>
                  <p className="chip">{live ? 'live' : 'coming soon'}</p>
                  <h3 className="display">{c.title}</h3>
                  <p>{c.line}</p>
                  <a href={live ? `/lab#env=${c.id}` : ISSUES}>{live ? 'Open in the Lab →' : 'Follow on GitHub →'}</a>
                </Window>
              );
            })}
          </div>
        </Section>

        <Section n={11} kicker="inspirations and credits" title="Standing on good shoulders.">
          <ul className="credits">
            <li><b>Memento</b>: soft Q-learning over memory, LLM frozen.</li>
            <li><b>ACE</b>: delta edits, not rewrites.</li>
            <li><b>karpathy/autoresearch</b>: the keep/revert ratchet.</li>
          </ul>
          <p>Built at <b>Sundai X Copenhagen</b>, October 2026. Theme: reinforcement learning for agents.</p>
        </Section>

        <Section n={12} kicker="learnabolic">
          <footer className="site-foot">
            <CopyCommand command={INSTALL} />
            <p><a href={GITHUB}>GitHub</a> · MIT · Made with care by Age van der Mei.</p>
          </footer>
        </Section>
      </main>
    </LiveProvider>
  );
}
