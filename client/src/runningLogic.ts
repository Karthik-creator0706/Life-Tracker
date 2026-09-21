// Running totals worked out on the client (used when the server doesn't send them). Pure, so it can be tested.

export interface Running {
  today: number; week: number; month: number; total: number; sessions: number; totalMinutes: number;
  days: { date: string; rounds: number }[];
  last: { date: string; rounds: number; durationMin: number } | null;
}
export interface RunRow { date: string; rounds: number; durationMin: number }


const day = (iso: string) => iso.slice(0, 10);

/**
 * Fallback for a server that doesn't send `running` yet (started before the update): work it out from the
 * run list instead. "All time" only covers the newest 100 runs there; a restarted server gives the exact figure.
 */
export function runningFromRows(rows: RunRow[], todayStr: string): Running {
  const DAY = 86_400_000;
  const t = Date.parse(todayStr);
  const sum = (list: RunRow[]) => Math.round(list.reduce((s, r) => s + r.rounds, 0) * 10) / 10;
  const days = Array.from({ length: 7 }, (_, i) => {
    const date = new Date(t - (6 - i) * DAY).toISOString().slice(0, 10);
    return { date, rounds: sum(rows.filter((r) => day(r.date) === date)) };
  });
  const month = todayStr.slice(0, 7);
  const last = rows[0]; // the list arrives newest first
  return {
    today: days[6].rounds,
    week: Math.round(days.reduce((s, d) => s + d.rounds, 0) * 10) / 10,
    month: sum(rows.filter((r) => day(r.date).startsWith(month) && day(r.date) <= todayStr)),
    total: sum(rows),
    sessions: rows.length,
    totalMinutes: rows.reduce((s, r) => s + r.durationMin, 0),
    days,
    last: last ? { date: day(last.date), rounds: last.rounds, durationMin: last.durationMin } : null,
  };
}
