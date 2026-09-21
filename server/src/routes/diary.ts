import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { prisma } from '../db.js';
import { httpError, notFound, parseDay } from '../http.js';
import { currentStreak, startOfToday } from './challenges.js';

const entrySchema = z.object({
  title: z.string().trim().max(120).nullish(),
  content: z.string().trim().min(1, 'Write something first').max(20000),
  mood: z.enum(['GREAT', 'GOOD', 'OKAY', 'LOW', 'BAD']).nullish(),
});

const monthRange = (month: string) => {
  const [y, m] = month.split('-').map(Number);
  if (!y || !m || m < 1 || m > 12) throw httpError(400, 'Invalid month');
  return { gte: new Date(Date.UTC(y, m - 1, 1)), lt: new Date(Date.UTC(y, m, 1)) };
};

export const diaryRoutes: FastifyPluginAsync = async (app) => {
  // List entries: ?q=search across all time, otherwise ?month=YYYY-MM (defaults to this month).
  app.get<{ Querystring: { month?: string; q?: string } }>('/', async (req) => {
    const userId = req.user.uid;
    const q = req.query.q?.trim();
    if (q) {
      // Plain substring match on lowercased text: case-insensitive, and % _  in the search are ordinary characters.
      const hits = await prisma.$queryRaw<{ id: number }[]>`
        SELECT id FROM "DiaryEntry"
        WHERE "userId" = ${userId}
          AND (strpos(lower(content), lower(${q})) > 0 OR strpos(lower(coalesce(title, '')), lower(${q})) > 0)
        ORDER BY date DESC LIMIT 50`;
      return prisma.diaryEntry.findMany({ where: { userId, id: { in: hits.map((h) => h.id) } }, orderBy: { date: 'desc' } });
    }
    const month = req.query.month ?? new Date().toISOString().slice(0, 7);
    return prisma.diaryEntry.findMany({
      where: { userId, date: monthRange(month) },
      orderBy: { date: 'desc' },
    });
  });

  app.get<{ Querystring: { today?: string } }>('/stats', async (req) => {
    const rows = await prisma.diaryEntry.findMany({ where: { userId: req.user.uid }, select: { date: true } });
    const todayMs = startOfToday(req.query.today);
    const monthStart = new Date(todayMs);
    monthStart.setUTCDate(1);
    return {
      total: rows.length,
      thisMonth: rows.filter((r) => r.date >= monthStart).length,
      streak: currentStreak(rows.map((r) => r.date), req.query.today),
      wroteToday: rows.some((r) => r.date.getTime() === todayMs),
    };
  });

  // { entry: null } when nothing is written for that day (not an error).
  app.get<{ Params: { date: string } }>('/:date', async (req) => {
    const entry = await prisma.diaryEntry.findUnique({
      where: { userId_date: { userId: req.user.uid, date: parseDay(req.params.date) } },
    });
    return { entry };
  });

  // Create or replace the entry for a day.
  app.put<{ Params: { date: string } }>('/:date', async (req) => {
    const data = entrySchema.parse(req.body);
    const date = parseDay(req.params.date);
    const userId = req.user.uid;
    return prisma.diaryEntry.upsert({
      where: { userId_date: { userId, date } },
      create: { ...data, userId, date },
      update: data,
    });
  });

  app.delete<{ Params: { date: string } }>('/:date', async (req, reply) => {
    const { count } = await prisma.diaryEntry.deleteMany({
      where: { userId: req.user.uid, date: parseDay(req.params.date) },
    });
    if (!count) throw notFound();
    return reply.status(204).send();
  });
};
