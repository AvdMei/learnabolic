'use client';
import { useEffect, useState, type RefObject } from 'react';

// True while the element is in the viewport, so offscreen animations stop ticking.
export function useIsOnScreen(ref: RefObject<Element | null>) {
  const [onScreen, setOnScreen] = useState(false);
  useEffect(() => {
    if (!ref.current) return;
    const io = new IntersectionObserver(([entry]) => setOnScreen(entry.isIntersecting));
    io.observe(ref.current);
    return () => io.disconnect();
  }, [ref]);
  return onScreen;
}
