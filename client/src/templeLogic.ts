// Pure decision logic for the daily temple reminder (no React, no browser APIs) so it can be tested on its own.

export interface TempleSettings {
  enabled: boolean; // the daily reminder: the banner (and the popups below) only appear when this is on
  time: string; // "HH:MM" local time: the reminder starts from then
  repeatMin: number; // ask again this often until you have gone; 0 = only once
  popups: boolean; // also send a browser notification (needs the browser's permission)
}

export interface TempleStats {
  totalDays: number;
  thisMonth: number;
  streak: number;
  bestStreak: number;
  visitedToday: boolean;
  firstVisit: string | null;
  lastVisit: string | null;
  daysSinceLast: number | null;
  lastTemple: string | null;
  temples: { name: string; days: number }[];
  recent?: { date: string; count: number }[]; // the last 7 days, oldest first (absent from an older server)
}

/** Repeats stop for the evening: nobody wants a temple reminder at midnight. */
export const LAST_REPEAT_HOUR = 21;

/** The moment today's reminder starts (local time) as ms. Falls back to 06:00 if `time` is malformed. */
export function reminderAt(now: number, time: string): number {
  const m = /^(\d{1,2}):(\d{2})$/.exec(time);
  const h = m ? Math.min(23, Number(m[1])) : 6;
  const min = m ? Math.min(59, Number(m[2])) : 0;
  const d = new Date(now);
  d.setHours(h, min, 0, 0);
  return d.getTime();
}

/** Should the in-app banner nag right now? True from the reminder time until you log a visit. */
export function reminderDue(s: Pick<TempleSettings, 'enabled' | 'time'>, now: number, visitedToday: boolean): boolean {
  return s.enabled && !visitedToday && now >= reminderAt(now, s.time);
}

export interface PopupInput {
  settings: TempleSettings;
  permission: string; // 'granted' | 'denied' | 'default' | 'unsupported'
  now: number; // ms
  visitedToday: boolean;
  lastNotified: number; // ms
}

/** Should a browser notification fire right now? The first one is at the reminder time, then it repeats. */
export function shouldPopup(i: PopupInput): boolean {
  const { settings: s } = i;
  if (!s.enabled || !s.popups || i.permission !== 'granted' || i.visitedToday) return false;
  const at = reminderAt(i.now, s.time);
  if (i.now < at) return false;
  if (i.lastNotified < at) return true; // nothing sent yet today
  if (s.repeatMin <= 0 || new Date(i.now).getHours() > LAST_REPEAT_HOUR) return false;
  return i.now - i.lastNotified >= s.repeatMin * 60_000;
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** "Last visit: yesterday" style text. */
export function sinceText(daysSinceLast: number | null): string {
  if (daysSinceLast === null) return 'No visit logged yet';
  if (daysSinceLast <= 0) return 'You went today';
  if (daysSinceLast === 1) return 'Last visit was yesterday';
  return `Last visit was ${daysSinceLast} days ago`;
}

/** The popup text: it always tells you how many days you have been so far. */
export function buildMessage(stats: TempleStats | null) {
  const title = '🛕 Time for the temple';
  if (!stats || stats.totalDays === 0) return { title, body: 'Start your first visit today 🙏' };
  const lines = [`You have been ${plural(stats.totalDays, 'day')} so far`];
  if (stats.streak > 1) lines.push(`🔥 ${stats.streak}-day streak: keep it going`);
  else if (stats.daysSinceLast && stats.daysSinceLast > 1) lines.push(sinceText(stats.daysSinceLast));
  return { title, body: lines.join('\n') };
}
