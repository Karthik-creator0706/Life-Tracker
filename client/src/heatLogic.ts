// Pure helpers for the consistency heatmap (no React), so they can be tested on their own.

export interface ActivityDay { date: string; count: number; kinds: string[]; tasks: number }

export const KIND_LABEL: Record<string, string> = {
  tasks: 'Tasks', study: 'Study', run: 'Rounds', workout: 'Workout', food: 'Food', diary: 'Diary', weight: 'Weight', challenge: 'Challenge',
  temple: 'Temple', screen: 'Screen time', movie: 'Movie',
};

/** Colour step 0-5: how many different parts of the app you used that day (capped so a great day is "full"). */
export function heatLevel(count: number): 0 | 1 | 2 | 3 | 4 | 5 {
  if (count <= 0) return 0;
  return Math.min(5, Math.floor(count)) as 1 | 2 | 3 | 4 | 5;
}

const at = (date: string) => new Date(`${date}T00:00:00Z`);
const fmt = (date: string, o: Intl.DateTimeFormatOptions) => at(date).toLocaleDateString('en-US', { ...o, timeZone: 'UTC' });

/**
 * Month names to print above the week columns: a label on the first column, and again whenever the
 * month changes. The days arrive oldest -> newest and fill the grid column by column (7 per column).
 */
export function monthLabels(days: ActivityDay[]): (string | null)[] {
  const cols = Math.ceil(days.length / 7);
  const out: (string | null)[] = [];
  let prev = '';
  for (let c = 0; c < cols; c++) {
    const month = days[c * 7].date.slice(0, 7);
    out.push(month !== prev ? fmt(days[c * 7].date, { month: 'short' }) : null);
    prev = month;
  }
  return out;
}

/** Row labels (Mon, Tue...) taken from the first column; only every other one is shown to keep it tidy. */
export function rowLabels(days: ActivityDay[]): (string | null)[] {
  return Array.from({ length: 7 }, (_, i) => (i % 2 === 1 && days[i] ? fmt(days[i].date, { weekday: 'short' }) : null));
}

/** Human sentence for a tapped square, e.g. "Sun, Sep 21 — 3 tasks done · Diary · Food". */
export function describeDay(d: ActivityDay): string {
  const head = fmt(d.date, { weekday: 'short', month: 'short', day: 'numeric' });
  if (d.count === 0) return `${head} — nothing logged`;
  const parts = d.kinds.map((k) => (k === 'tasks' ? `${d.tasks} task${d.tasks === 1 ? '' : 's'} done` : KIND_LABEL[k] ?? k));
  return `${head} — ${parts.join(' · ')}`;
}
