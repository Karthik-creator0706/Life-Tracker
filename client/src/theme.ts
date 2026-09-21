// Four looks: the comic Spider-Man (the default), The Amazing Spider-Man, Light and Dark.
// The choice is remembered in this browser.
export type Theme = 'light' | 'dark' | 'spidey' | 'amazing';

/** The order the toggle button cycles through. */
export const THEMES: Theme[] = ['spidey', 'amazing', 'light', 'dark'];

export const THEME_NAMES: Record<Theme, string> = {
  spidey: 'Spider-Man',
  amazing: 'The Amazing Spider-Man',
  light: 'Light',
  dark: 'Dark',
};

// A fresh key (v2) so an older light/dark choice saved by a previous version doesn't hide the new default.
const KEY = 'lt_theme2';

const BAR_COLOR: Record<Theme, string> = { light: '#4f46e5', dark: '#181b25', spidey: '#070b1c', amazing: '#040914' };

const stored = (): Theme | null => {
  try {
    const v = localStorage.getItem(KEY);
    return (THEMES as string[]).includes(v ?? '') ? (v as Theme) : null;
  } catch {
    return null;
  }
};

export const currentTheme = (): Theme => stored() ?? 'spidey';

export const nextTheme = (t: Theme): Theme => THEMES[(THEMES.indexOf(t) + 1) % THEMES.length];

export function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', BAR_COLOR[theme]);
}

export function setTheme(theme: Theme) {
  try { localStorage.setItem(KEY, theme); } catch { /* storage blocked: just don't remember it */ }
  applyTheme(theme);
  // tell every part of the UI that shows the theme (the toggle button, the Profile picker)
  if (typeof window !== 'undefined') window.dispatchEvent(new Event('lt:theme'));
}
