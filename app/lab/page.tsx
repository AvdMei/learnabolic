import type { Metadata } from 'next';
import { Lab } from '@/components/Lab';

export const metadata: Metadata = { title: 'Lab · Learnabolic', description: 'Watch a skill learn, live: the real core.mjs running in your browser.' };

export default function LabPage() {
  return (
    <main className="lab-page paper">
      <header className="lab-head">
        <p className="kicker">Learnabolic · Lab</p>
        <h1 className="display cursor">Watch it learn</h1>
      </header>
      <Lab />
    </main>
  );
}
