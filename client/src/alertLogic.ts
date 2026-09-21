// Pure decision logic for to-do alerts (no React, no browser APIs) so it can be tested on its own.

export interface AlertTodo { id: number; title: string; priority: string; done: boolean; dueDate: string | null }

const WEIGHT: Record<string, number> = { HIGH: 0, MEDIUM: 1, LOW: 2 };

/**
 * Unfinished tasks that need attention: overdue (due before today) and due today.
 * `todayStr` is the user's LOCAL date as YYYY-MM-DD; due dates are calendar days (first 10 chars).
 * Tasks with no due date are never nagged about.
 */
export function classify(todos: AlertTodo[], todayStr: string) {
  const overdue: AlertTodo[] = [];
  const dueToday: AlertTodo[] = [];
  for (const t of todos) {
    if (t.done || !t.dueDate) continue;
    const d = t.dueDate.slice(0, 10);
    if (d < todayStr) overdue.push(t);
    else if (d === todayStr) dueToday.push(t);
  }
  overdue.sort((a, b) => a.dueDate!.localeCompare(b.dueDate!)); // longest overdue first
  dueToday.sort((a, b) => (WEIGHT[a.priority] ?? 1) - (WEIGHT[b.priority] ?? 1));
  return { overdue, dueToday };
}

export interface NotifyInput {
  enabled: boolean;
  permission: string; // 'granted' | 'denied' | 'default' | 'unsupported'
  now: number; // ms
  startHour: number; // inclusive, local time
  endHour: number; // exclusive, local time
  snoozeUntil: number; // ms
  lastNotified: number; // ms
  intervalMin: number;
  pending: number;
}

/** Should a browser notification fire right now? */
export function shouldNotify(i: NotifyInput): boolean {
  if (!i.enabled || i.permission !== 'granted') return false;
  if (i.pending <= 0) return false;
  if (i.now < i.snoozeUntil) return false;
  const hour = new Date(i.now).getHours();
  if (hour < i.startHour || hour >= i.endHour) return false;
  return i.now - i.lastNotified >= i.intervalMin * 60_000;
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

export function buildMessage(overdue: AlertTodo[], dueToday: AlertTodo[]) {
  const total = overdue.length + dueToday.length;
  const title = overdue.length
    ? `⏰ ${plural(overdue.length, 'overdue task')}${dueToday.length ? ` · ${dueToday.length} due today` : ''}`
    : `📝 ${plural(dueToday.length, 'task')} due today`;
  const lines = [...overdue, ...dueToday].slice(0, 3).map((t) => `• ${t.title}`);
  if (total > 3) lines.push(`…and ${total - 3} more`);
  return { title, body: lines.join('\n') };
}
