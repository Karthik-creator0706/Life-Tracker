import { useEffect, useState } from 'react';
import { currentTheme, Theme } from './theme';

const EXIT_MS = 220; // keep in sync with the .leaving animation in styles.css

/**
 * Plays the "leaving" animation on a list row before the real delete runs.
 * If the action fails the row comes back.
 */
export function useLeaving() {
  const [leaving, setLeaving] = useState<ReadonlySet<number | string>>(new Set());

  async function leave(id: number | string, action: () => Promise<unknown>) {
    setLeaving((s) => new Set(s).add(id));
    await new Promise((r) => setTimeout(r, EXIT_MS));
    try {
      await action();
    } finally {
      setLeaving((s) => {
        const next = new Set(s);
        next.delete(id);
        return next;
      });
    }
  }

  return { isLeaving: (id: number | string) => leaving.has(id), leave };
}

export function useDebounced<T>(value: T, ms = 300): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

export const prefersReducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** The current theme, kept in step with changes made anywhere (the toggle button, the Profile picker). */
export function useTheme(): Theme {
  const [theme, setTheme] = useState<Theme>(currentTheme);
  useEffect(() => {
    const onChange = () => setTheme(currentTheme());
    window.addEventListener('lt:theme', onChange);
    return () => window.removeEventListener('lt:theme', onChange);
  }, []);
  return theme;
}
