import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { prisma } from '../db.js';
import { httpError, parseDay } from '../http.js';
import { startOfToday } from './challenges.js';

const DAY = 86_400_000;
const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);

export const APPS = ['INSTAGRAM', 'YOUTUBE', 'GAMES', 'MOVIES', 'OTHER'] as const;
type App = (typeof APPS)[number];
const isApp = (s: string): s is App => (APPS as readonly string[]).includes(s);

// Minutes per app for one day. 0 removes that app's row for the day.
const daySchema = z.object({
  entries: z.record(z.enum(APPS), z.number().int().min(0, 'Minutes cannot be negative').max(1440, 'A day only has 1440 minutes')),
});

const limitSchema = z.object({
  screenLimitMin: z.number().int().min(15, 'Limit must be at least 15 minutes').max(1440).nullable(),
});

const emptyDay = (): Record<App, number> => ({ INSTAGRAM: 0, YOUTUBE: 0, GAMES: 0, MOVIES: 0, OTHER: 0 });

export const screenRoutes: FastifyPluginAsync = async (app) => {
  // One day's minutes per app: { entries: { INSTAGRAM: 45, ... } } (apps with nothing logged are 0).
  app.get<{ Params: { date: string } }>('/day/:date', async (req) => {
    const rows = await prisma.screenTime.findMany({ where: { userId: req.user.uid, date: parseDay(req.params.date) } });
    const entries = emptyDay();
    for (const r of rows) if (isApp(r.app)) entries[r.app] = r.minutes;
    return { entries };
  });

  // Save a whole day at once. The apps you send replace what was there; apps you leave out are untouched.
  app.put<{ Params: { date: string }; Querystring: { today?: string } }>('/day/:date', async (req) => {
    const userId = req.user.uid;
    const date = parseDay(req.params.date);
    if (date.getTime() > startOfToday(req.query.today) + DAY) throw httpError(400, "You can't log screen time in the future");
    const { entries } = daySchema.parse(req.body);

    const existing = await prisma.screenTime.findMany({ where: { userId, date }, select: { app: true, minutes: true } });
    const merged = new Map<string, number>(existing.map((r) => [r.app, r.minutes]));
    for (const [a, m] of Object.entries(entries)) merged.set(a, m as number);
    const total = [...merged.values()].reduce((s, m) => s + m, 0);
    if (total > 1440) throw httpError(400, `That adds up to ${Math.floor(total / 60)}h ${total % 60}m: more than a day has`);

    await prisma.$transaction(
      Object.entries(entries).map(([a, minutes]) =>
        minutes > 0
          ? prisma.screenTime.upsert({
              where: { userId_date_app: { userId, date, app: a } },
              create: { userId, date, app: a, minutes: minutes as number },
              update: { minutes: minutes as number },
            })
          : prisma.screenTime.deleteMany({ where: { userId, date, app: a } }),
      ),
    );
    return { ok: true };
  });

  // Daily limit in minutes. Send { screenLimitMin: null } to clear it.
  app.put('/limit', async (req) => {
    const { screenLimitMin } = limitSchema.parse(req.body);
    await prisma.user.update({ where: { id: req.user.uid }, data: { screenLimitMin } });
    return { screenLimitMin };
  });

  // Everything the page shows: today, the last 14 days, this week against last week, and where the time goes.
  app.get<{ Querystring: { today?: string } }>('/overview', async (req) => {
    const userId = req.user.uid;
    const todayMs = startOfToday(req.query.today);
    const from = todayMs - 13 * DAY;

    const [rows, user] = await Promise.all([
      prisma.screenTime.findMany({ where: { userId, date: { gte: new Date(from), lte: new Date(todayMs) } }, select: { date: true, app: true, minutes: true } }),
      prisma.user.findUnique({ where: { id: userId }, select: { screenLimitMin: true } }),
    ]);

    const byDay = new Map<string, Record<App, number>>();
    for (const r of rows) {
      if (!isApp(r.app)) continue;
      const key = iso(r.date.getTime());
      const d = byDay.get(key) ?? emptyDay();
      d[r.app] += r.minutes;
      byDay.set(key, d);
    }

    const days = Array.from({ length: 14 }, (_, i) => {
      const date = iso(from + i * DAY);
      const apps = byDay.get(date) ?? emptyDay();
      return { date, apps, total: Object.values(apps).reduce((s, m) => s + m, 0) };
    });
    const thisWeek = days.slice(7); // the last 7 days, today included
    const lastWeek = days.slice(0, 7);
    const sum = (list: typeof days) => list.reduce((s, d) => s + d.total, 0);

    const byApp = emptyDay();
    for (const d of thisWeek) for (const a of APPS) byApp[a] += d.apps[a];

    const limit = user?.screenLimitMin ?? null;
    const today = days[13];
    return {
      today: { date: today.date, apps: today.apps, total: today.total },
      limitMin: limit,
      days,
      weekTotal: sum(thisWeek),
      weekAvg: Math.round(sum(thisWeek) / 7),
      lastWeekTotal: sum(lastWeek),
      byApp, // this week's minutes per app
      loggedDays: days.filter((d) => d.total > 0).length,
      daysOverLimit: limit ? thisWeek.filter((d) => d.total > limit).length : null,
    };
  });
};
