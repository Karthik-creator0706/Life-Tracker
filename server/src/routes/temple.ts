import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { prisma } from '../db.js';
import { httpError, notFound, parseDay } from '../http.js';
import { bestRun } from './character.js';
import { currentStreak, startOfToday } from './challenges.js';

const DAY = 86_400_000;
const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const blank = (s?: string | null) => s?.trim() || null; // "" and whitespace mean "not set"

const visitSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a YYYY-MM-DD date'),
  temple: z.string().trim().min(1, 'Which temple did you visit?').max(80),
  note: z.string().trim().max(1000).nullish(),
});

const monthRange = (month: string) => {
  const [y, m] = month.split('-').map(Number);
  if (!y || !m || m < 1 || m > 12) throw httpError(400, 'Invalid month');
  return { gte: new Date(Date.UTC(y, m - 1, 1)), lt: new Date(Date.UTC(y, m, 1)) };
};

export const templeRoutes: FastifyPluginAsync = async (app) => {
  // A visit can be logged for any day up to today (one day of slack for time zones ahead of the server).
  const checkDate = (value: string, today?: string) => {
    const date = parseDay(value);
    if (date.getTime() > startOfToday(today) + DAY) throw httpError(400, "You can't log a visit in the future");
    return date;
  };

  const clash = (userId: number, date: Date, temple: string, exceptId?: number) =>
    prisma.templeVisit.findFirst({
      where: { userId, date, temple: { equals: temple, mode: 'insensitive' }, ...(exceptId ? { id: { not: exceptId } } : {}) },
      select: { id: true },
    });

  // Visits of one month (?month=YYYY-MM, defaults to this month), newest first.
  app.get<{ Querystring: { month?: string } }>('/', async (req) => {
    const month = req.query.month ?? new Date().toISOString().slice(0, 7);
    return prisma.templeVisit.findMany({
      where: { userId: req.user.uid, date: monthRange(month) },
      orderBy: [{ date: 'desc' }, { id: 'desc' }],
    });
  });

  app.post<{ Querystring: { today?: string } }>('/', async (req, reply) => {
    const userId = req.user.uid;
    const b = visitSchema.parse(req.body);
    const date = checkDate(b.date, req.query.today);
    if (await clash(userId, date, b.temple)) throw httpError(409, `You already logged ${b.temple} for that day`);
    const visit = await prisma.templeVisit.create({ data: { userId, date, temple: b.temple, note: blank(b.note) } });
    return reply.status(201).send(visit);
  });

  app.put<{ Params: { id: string }; Querystring: { today?: string } }>('/:id', async (req) => {
    const userId = req.user.uid;
    const id = Number(req.params.id);
    const b = visitSchema.parse(req.body);
    const date = checkDate(b.date, req.query.today);
    if (await clash(userId, date, b.temple, id)) throw httpError(409, `You already logged ${b.temple} for that day`);
    const { count } = await prisma.templeVisit.updateMany({ where: { id, userId }, data: { date, temple: b.temple, note: blank(b.note) } });
    if (!count) throw notFound();
    return prisma.templeVisit.findFirst({ where: { id, userId } });
  });

  app.delete<{ Params: { id: string } }>('/:id', async (req, reply) => {
    const { count } = await prisma.templeVisit.deleteMany({ where: { id: Number(req.params.id), userId: req.user.uid } });
    if (!count) throw notFound();
    return reply.status(204).send();
  });

  // The numbers: how many days you have been, streaks, when you last went. A "day" counts once however many temples you saw.
  app.get<{ Querystring: { today?: string } }>('/stats', async (req) => {
    const rows = await prisma.templeVisit.findMany({
      where: { userId: req.user.uid },
      select: { date: true, temple: true },
      orderBy: [{ date: 'desc' }, { id: 'desc' }],
    });
    const todayMs = startOfToday(req.query.today);
    const monthStart = new Date(todayMs);
    monthStart.setUTCDate(1);

    const dayList = [...new Set(rows.map((r) => iso(r.date.getTime())))].sort(); // ascending, one per day
    const past = dayList.filter((d) => Date.parse(d) <= todayMs);
    const last = past[past.length - 1] ?? null;

    // Group by temple name ignoring case; rows are newest first, so each temple shows the way you last wrote it.
    const byTemple = new Map<string, { name: string; days: Set<string> }>();
    for (const r of rows) {
      const key = r.temple.trim().toLowerCase();
      const entry = byTemple.get(key) ?? { name: r.temple, days: new Set<string>() };
      entry.days.add(iso(r.date.getTime()));
      byTemple.set(key, entry);
    }
    const temples = [...byTemple.values()]
      .map((t) => ({ name: t.name, days: t.days.size }))
      .sort((a, b) => b.days - a.days || a.name.localeCompare(b.name));

    // Temples seen on each of the last 7 days (oldest first), for the dashboard's small chart.
    const perDay = new Map<string, number>();
    for (const r of rows) perDay.set(iso(r.date.getTime()), (perDay.get(iso(r.date.getTime())) ?? 0) + 1);
    const recent = Array.from({ length: 7 }, (_, i) => {
      const date = iso(todayMs - (6 - i) * DAY);
      return { date, count: perDay.get(date) ?? 0 };
    });

    return {
      recent,
      totalDays: dayList.length, // how many days you have been to a temple
      totalVisits: rows.length,
      thisMonth: dayList.filter((d) => Date.parse(d) >= monthStart.getTime() && Date.parse(d) <= todayMs).length,
      streak: currentStreak(rows.map((r) => r.date), req.query.today),
      bestStreak: bestRun(dayList),
      visitedToday: dayList.includes(iso(todayMs)),
      firstVisit: dayList[0] ?? null,
      lastVisit: last,
      daysSinceLast: last ? Math.round((todayMs - Date.parse(last)) / DAY) : null,
      lastTemple: rows[0]?.temple ?? null,
      temples,
    };
  });
};
