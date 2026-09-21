// The apps tracked on the Screen time page, shared by that page, the dashboard card and the stats charts.

export type AppKey = 'INSTAGRAM' | 'YOUTUBE' | 'GAMES' | 'MOVIES' | 'OTHER';

export const SCREEN_APPS: { key: AppKey; emoji: string; label: string; color: string }[] = [
  { key: 'INSTAGRAM', emoji: '📸', label: 'Instagram', color: '#e1306c' },
  { key: 'YOUTUBE', emoji: '▶️', label: 'YouTube', color: '#ff3b30' },
  { key: 'GAMES', emoji: '🎮', label: 'Games', color: '#7c5cff' },
  { key: 'MOVIES', emoji: '🎬', label: 'Movies', color: '#f5a524' },
  { key: 'OTHER', emoji: '📱', label: 'Other', color: '#6b7a90' },
];

/** "📸 Instagram" for an app key from the server (falls back to the raw key). */
export const screenAppLabel = (key: string) => {
  const a = SCREEN_APPS.find((x) => x.key === key);
  return a ? `${a.emoji} ${a.label}` : key;
};
