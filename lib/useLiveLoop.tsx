'use client';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { envs } from '../envs/index.ts';
import type { Env } from './env.ts';
import { createLoop, type View } from './loop.ts';

// Batches per animation frame. max = 4/frame ≈ 2400 batches in 10 s (the budget loop.test.ts checks).
export const SPEEDS = { '1×': 0.15, '10×': 1.5, max: 4 } as const;
export type Speed = keyof typeof SPEEDS;

// Runs a loop in the browser with requestAnimationFrame batching. The math stays in core.mjs via lib/loop.ts.
export function useLiveLoop(env: Env<unknown>, { autoplay = false, initialSpeed = '1×' as Speed } = {}) {
  const [loop, setLoop] = useState(() => createLoop(env, { seed: 7 }));
  const [view, setView] = useState<View<unknown> | null>(null);
  const [playing, setPlaying] = useState(false);
  useEffect(() => {
    if (!autoplay) return;
    const id = setTimeout(() => setPlaying(true), 1200); // let the page settle before the loop starts
    return () => clearTimeout(id);
  }, [autoplay]);
  const [speed, setSpeed] = useState<Speed>(initialSpeed);
  const [failure, setFailure] = useState<string | null>(null);
  useEffect(() => loop.subscribe(setView), [loop]);
  useEffect(() => {
    if (!playing) return;
    let acc = 0;
    let raf = requestAnimationFrame(function tick() {
      acc += SPEEDS[speed];
      const n = Math.floor(acc);
      acc -= n;
      if (n) loop.step(n).catch((err: unknown) => {
        setPlaying(false);
        setFailure(err instanceof Error ? err.message : String(err));
      });
      raf = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(raf);
  }, [loop, playing, speed]);
  const reset = () => setLoop(createLoop(env, { seed: Date.now() >>> 0, weights: view?.weights }));
  return { env, loop, view, playing, setPlaying, speed, setSpeed, failure, reset };
}
export type Live = ReturnType<typeof useLiveLoop>;

// The landing page shares one brain across its sections.
const LiveContext = createContext<Live | null>(null);
export function LiveProvider({ envId, children }: { envId: string; children: ReactNode }) {
  return <LiveContext.Provider value={useLiveLoop(envs[envId], { autoplay: true, initialSpeed: '10×' })}>{children}</LiveContext.Provider>;
}
export function useLive(): Live {
  const live = useContext(LiveContext);
  if (!live) throw new Error('useLive() must be used inside <LiveProvider>');
  return live;
}
