// Pure date/grouping logic for the Career page (no React), so it can be tested on its own.
// Calendar days are "YYYY-MM-DD" strings, and all maths is done in UTC so time zones can't shift a day.

export interface CareerTask {
  id: number;
  title: string;
  subject: string | null;
  dueDate: string; // ISO timestamp at UTC midnight; the first 10 characters are the calendar day
  done: boolean;
  doneAt: string | null;
}

export type Horizon = 'TODAY' | 'WEEK' | 'MONTH';

const DAY = 86_400_000;
const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);

export const shiftDay = (d: string, n: number) => iso(Date.parse(d) + n * DAY);

/** The Sunday that ends the Monday-to-Sunday week containing `d` (a Sunday is its own week's end). */
export function endOfWeek(d: string): string {
  const dow = new Date(`${d}T00:00:00Z`).getUTCDay(); // Sun 0 ... Sat 6
  return shiftDay(d, 7 - (dow === 0 ? 7 : dow));
}

/** The last calendar day of `d`'s month. */
export function endOfMonth(d: string): string {
  const y = Number(d.slice(0, 4));
  const m = Number(d.slice(5, 7)); // 1-12
  return iso(Date.UTC(y, m, 0)); // day 0 of the NEXT month = last day of this one
}

/** The due date the quick buttons use. */
export function dueFor(h: Horizon, today: string): string {
  return h === 'TODAY' ? today : h === 'WEEK' ? endOfWeek(today) : endOfMonth(today);
}

export interface Buckets<T> { overdue: T[]; today: T[]; week: T[]; month: T[]; later: T[] }

/** Sorts unfinished tasks into overdue / today / rest of this week / rest of this month / later. */
export function bucketTasks<T extends Pick<CareerTask, 'dueDate' | 'done'>>(tasks: T[], today: string): Buckets<T> {
  const eow = endOfWeek(today);
  const eom = endOfMonth(today);
  const out: Buckets<T> = { overdue: [], today: [], week: [], month: [], later: [] };
  for (const t of tasks) {
    if (t.done) continue;
    const d = t.dueDate.slice(0, 10);
    if (d < today) out.overdue.push(t);
    else if (d === today) out.today.push(t);
    else if (d <= eow) out.week.push(t); // checked before the month, so a week that spills into next month stays "this week"
    else if (d <= eom) out.month.push(t);
    else out.later.push(t);
  }
  return out;
}

/** "45m", "1h", "1h 30m". */
export function fmtMinutes(min: number): string {
  const m = Math.max(0, Math.round(min));
  const h = Math.floor(m / 60);
  const r = m % 60;
  return h === 0 ? `${r}m` : r === 0 ? `${h}h` : `${h}h ${r}m`;
}

export interface StudyProgress { kind: 'none' | 'progress' | 'met'; pct: number; left: number }

export function studyProgress(minutes: number, goal: number | null): StudyProgress {
  if (!goal || goal <= 0) return { kind: 'none', pct: 0, left: 0 };
  const pct = Math.min(100, (minutes / goal) * 100);
  return minutes >= goal ? { kind: 'met', pct, left: 0 } : { kind: 'progress', pct, left: goal - minutes };
}
