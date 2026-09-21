// Small pure calculations behind the dashboard summary cards (no React), so they can be tested on their own.

/** Shift a YYYY-MM-DD calendar day by n days (done in UTC so time zones can't move it). */
export const shiftDay = (d: string, n: number) => new Date(Date.parse(d) + n * 86_400_000).toISOString().slice(0, 10);

/** Weight change over the last 30 days (newest - oldest reading in that window); null if fewer than two readings. */
export function weightChange(points: { date: string; weightKg: number }[], todayStr: string): number | null {
  const cutoff = shiftDay(todayStr, -29);
  const recent = points.filter((p) => p.date >= cutoff && p.date <= todayStr);
  if (recent.length < 2) return null;
  return Math.round((recent[recent.length - 1].weightKg - recent[0].weightKg) * 10) / 10;
}

export interface CalorieStatus {
  kind: 'none' | 'left' | 'over';
  amount: number; // kcal left (kind 'left') or over (kind 'over'); 0 when there is no goal
  pct: number; // 0-100, how much of the goal is used (capped at 100)
}

export function calorieStatus(eaten: number, goal: number | null): CalorieStatus {
  if (!goal || goal <= 0) return { kind: 'none', amount: 0, pct: 0 };
  const pct = Math.min(100, (eaten / goal) * 100);
  return eaten > goal ? { kind: 'over', amount: eaten - goal, pct } : { kind: 'left', amount: goal - eaten, pct };
}

export interface MovieLite {
  id: number;
  title: string;
  status: 'WATCHING' | 'WATCHED' | 'WANT';
  reaction: 'LOVED' | 'OKAY' | 'HATED' | null;
  favorite: boolean;
  rating: number | null;
  watchedOn: string | null;
}

/** Numbers for the dashboard's Movies card. `todayStr` is the local YYYY-MM-DD; watched dates are calendar days (first 10 chars). */
export function movieSummary(list: MovieLite[], todayStr: string) {
  const watched = list.filter((m) => m.status === 'WATCHED');
  const [y, mo] = todayStr.split('-').map(Number);
  const months = Array.from({ length: 6 }, (_, i) => {
    const month = new Date(Date.UTC(y, mo - 1 - (5 - i), 1)).toISOString().slice(0, 7);
    return { month, count: watched.filter((m) => m.watchedOn?.slice(0, 7) === month).length };
  });
  const lastWatched = [...watched].sort((a, b) => (b.watchedOn ?? '').localeCompare(a.watchedOn ?? '') || b.id - a.id)[0] ?? null;
  return {
    total: list.length,
    watched: watched.length,
    thisYear: watched.filter((m) => m.watchedOn?.startsWith(todayStr.slice(0, 4))).length,
    watching: list.filter((m) => m.status === 'WATCHING'),
    favorites: list.filter((m) => m.favorite),
    loved: list.filter((m) => m.reaction === 'LOVED').length,
    hated: list.filter((m) => m.reaction === 'HATED').length,
    months,
    lastWatched,
  };
}

export interface ChallengeLite { id: number; completedDays: number; targetDays: number; streak: number }

export function challengeTotals(list: ChallengeLite[], doneToday?: { id: number; doneToday: boolean }[]) {
  const checked = doneToday ? list.filter((c) => doneToday.find((d) => d.id === c.id)?.doneToday).length : null;
  return {
    active: list.length,
    bestStreak: list.reduce((m, c) => Math.max(m, c.streak), 0),
    daysDone: list.reduce((s, c) => s + c.completedDays, 0),
    checkedIn: checked === null ? null : `${checked}/${list.length}`,
  };
}
