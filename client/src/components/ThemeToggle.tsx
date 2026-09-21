import { MouseEvent } from 'react';
import { prefersReducedMotion, useTheme } from '../hooks';
import { nextTheme, setTheme, Theme, THEME_NAMES } from '../theme';

type ViewTransitionDoc = Document & { startViewTransition?: (update: () => void) => { ready: Promise<void>; finished: Promise<void> } };

// The button shows the theme you'll get by pressing it.
const ICON: Record<Theme, string> = { spidey: '🕷️', amazing: '🕸️', light: '☀️', dark: '🌙' };

export default function ThemeToggle({ className = '' }: { className?: string }) {
  const theme = useTheme();
  const next = nextTheme(theme);

  function toggle(e: MouseEvent<HTMLButtonElement>) {
    const apply = () => setTheme(next);

    // Where the browser supports it, the new theme spreads out from the button like a ripple.
    const doc = document as ViewTransitionDoc;
    if (!doc.startViewTransition || prefersReducedMotion()) {
      apply();
      return;
    }
    const box = e.currentTarget.getBoundingClientRect();
    const x = box.left + box.width / 2;
    const y = box.top + box.height / 2;
    const radius = Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y));

    const root = document.documentElement;
    const transition = doc.startViewTransition(() => {
      root.classList.add('theme-switching'); // pause the usual colour fades so the new theme is captured cleanly
      apply();
    });
    transition.ready
      .then(() => {
        root.animate(
          { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${radius}px at ${x}px ${y}px)`] },
          { duration: 600, easing: 'cubic-bezier(.4, 0, .2, 1)', pseudoElement: '::view-transition-new(root)' },
        );
      })
      .catch(() => { /* transition skipped: the theme is already applied */ });
    transition.finished.finally(() => root.classList.remove('theme-switching'));
  }

  return (
    <button
      className={`theme-toggle ${className}`}
      onClick={toggle}
      aria-label={`Switch to ${THEME_NAMES[next]}`}
      title={THEME_NAMES[next]}
    >
      <span key={theme} className="theme-icon">{ICON[next]}</span>
    </button>
  );
}
