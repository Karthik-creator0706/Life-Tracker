import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { prisma } from '../db.js';
import { notFound, parseDay } from '../http.js';
import { startOfToday } from './challenges.js';

const DAY = 86_400_000;

const entrySchema = z.object({
  date: z.coerce.date(),
  meal: z.enum(['BREAKFAST', 'LUNCH', 'DINNER', 'SNACK']),
  place: z.enum(['HOME', 'OUTSIDE']),
  name: z.string().trim().min(1, 'What did you eat?').max(120),
  calories: z.number().int().min(0).max(10000).nullish(),
  note: z.string().trim().max(300).nullish(),
});

const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);

export const foodRoutes: FastifyPluginAsync = async (app) => {
  // Everything eaten on one day: ?date=YYYY-MM-DD
  app.get<{ Querystring: { date?: string } }>('/', async (req) => {
    const date = parseDay(req.query.date ?? iso(startOfToday()));
    return prisma.foodEntry.findMany({
      where: { userId: req.user.uid, date },
      orderBy: { createdAt: 'asc' },
    });
  });

  // Last 7 days (home vs outside per day) + this month's split. ?today=YYYY-MM-DD is the client's local date.
  app.get<{ Querystring: { today?: string } }>('/stats', async (req) => {
    const todayMs = startOfToday(req.query.today);
    const weekStart = todayMs - 6 * DAY;
    const monthStart = new Date(todayMs);
    monthStart.setUTCDate(1);

    const rows = await prisma.foodEntry.findMany({
      where: { userId: req.user.uid, date: { gte: new Date(Math.min(weekStart, monthStart.getTime())) } },
      select: { date: true, place: true, meal: true, calories: true },
    });
    const user = await prisma.user.findUnique({ where: { id: req.user.uid }, select: { calorieGoal: true } });
    const kcal = (list: { calories: number | null }[]) => list.reduce((sum, r) => sum + (r.calories ?? 0), 0);

    const days = Array.from({ length: 7 }, (_, i) => {
      const ms = weekStart + i * DAY;
      const mine = rows.filter((r) => r.date.getTime() === ms);
      return {
        date: iso(ms),
        total: mine.length,
        calories: kcal(mine),
        home: mine.filter((r) => r.place === 'HOME').length,
        outside: mine.filter((r) => r.place === 'OUTSIDE').length,
      };
    });

    const thisMonth = rows.filter((r) => r.date >= monthStart);
    return {
      goal: user?.calorieGoal ?? null,
      days,
      month: {
        total: thisMonth.length,
        calories: kcal(thisMonth),
        home: thisMonth.filter((r) => r.place === 'HOME').length,
        outside: thisMonth.filter((r) => r.place === 'OUTSIDE').length,
        snacks: thisMonth.filter((r) => r.meal === 'SNACK').length,
      },
    };
  });

  // Foods you log most often (last ~3 months), for one-tap re-use.
  app.get('/recent', async (req) => {
    const rows = await prisma.foodEntry.findMany({
      where: { userId: req.user.uid, date: { gte: new Date(startOfToday() - 90 * DAY) } },
      orderBy: { createdAt: 'desc' },
      select: { name: true, meal: true, place: true, calories: true },
      take: 500,
    });
    const seen = new Map<string, { name: string; meal: string; place: string; calories: number | null; count: number }>();
    for (const r of rows) {
      const key = r.name.toLowerCase();
      const hit = seen.get(key);
      if (hit) hit.count++;
      else seen.set(key, { ...r, count: 1 }); // first seen = most recent, so its meal/place are the latest used
    }
    return [...seen.values()].sort((a, b) => b.count - a.count).slice(0, 10);
  });

  // Daily calorie goal. Send { calorieGoal: null } to clear it.
  app.put('/goal', async (req) => {
    const { calorieGoal } = z
      .object({ calorieGoal: z.number().int().min(500, 'Goal must be at least 500 kcal').max(10000).nullable() })
      .parse(req.body);
    await prisma.user.update({ where: { id: req.user.uid }, data: { calorieGoal } });
    return { calorieGoal };
  });

  app.post('/', async (req, reply) =>
    reply.status(201).send(await prisma.foodEntry.create({ data: { ...entrySchema.parse(req.body), userId: req.user.uid } })),
  );

  app.put<{ Params: { id: string } }>('/:id', async (req) => {
    const where = { id: Number(req.params.id), userId: req.user.uid };
    const { count } = await prisma.foodEntry.updateMany({ where, data: entrySchema.parse(req.body) });
    if (!count) throw notFound();
    return prisma.foodEntry.findFirst({ where });
  });

  app.delete<{ Params: { id: string } }>('/:id', async (req, reply) => {
    const { count } = await prisma.foodEntry.deleteMany({ where: { id: Number(req.params.id), userId: req.user.uid } });
    if (!count) throw notFound();
    return reply.status(204).send();
  });
};
