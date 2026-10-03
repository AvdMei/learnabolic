import type { Metadata } from 'next';
import localFont from 'next/font/local';
import Link from 'next/link';
import { GITHUB } from '@/lib/siteLinks';
import './globals.css';

// Pixel display face (one weight only; never bold it) and the monospace reading face, both self-hosted.
const pressStart = localFont({ src: './fonts/PressStart2P-400.woff2', weight: '400', variable: '--font-press-start' });
const plexMono = localFont({
  src: [
    { path: './fonts/IBMPlexMono-400.woff2', weight: '400' },
    { path: './fonts/IBMPlexMono-500.woff2', weight: '500' },
    { path: './fonts/IBMPlexMono-600.woff2', weight: '600' },
  ],
  variable: '--font-plex-mono',
});

export const metadata: Metadata = {
  title: 'Learnabolic · give AI agents (recursive) self-improvement',
  description: 'Give any agent skill recursive self-improvement. The LLM proposes, statistics disposes.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${pressStart.variable} ${plexMono.variable}`}>
      <body>
        <nav className="menubar" aria-label="Main">
          <Link href="/" className="brand">Learnabolic</Link>
          <Link href="/lab">Lab</Link>
          <a href={GITHUB}>GitHub</a>
        </nav>
        {children}
      </body>
    </html>
  );
}
