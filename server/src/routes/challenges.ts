import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { prisma } from '../db.js';
import { notFound } from '../http.js';

const schema = z.object({
  title: z.string().min(1).max(120),
  description: z.string().max(1000).nullish(),
  startDate: z.coerce.date(),
  targetDays: z.number().int().min(1).max(3650),
});

const checkinSchema = z.object({ date: z.coerce.date() });

const DAY = 86_400_000;
/** Client's local date ("YYYY-MM-DD") as UTC-midnight ms; falls back to the server's UTC today. */
export const startOfToday = (today?: string) => {
  const parsed = today && /^\d{4}-\d{2}-\d{2}$/.test(today) ? Date.parse(today) : NaN;
  if (!Number.isNaN(parsed)) return parsed;
  const n = new Date();
  return Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate());
};

/** Consecutive checked-in days ending today (or yesterday, so today isn't "broken" yet). */
export function currentStreak(dates: Date[], today?: string): number {
  const set = new Set(dates.map((d) => d.getTime()));
  let day = startOfToday(today);
  if (!set.has(day)) day -= DAY;
  let streak = 0;
  while (set.has(day)) {
    streak++;
    day -= DAY;
  }
  return streak;
}

export const challengeRoutes: FastifyPluginAsync = async (app) => {
  app.get<{ Querystring: { today?: string } }>('/', async (req) => {
    const rows = await prisma.challenge.findMany({
      where: { userId: req.user.uid },
      include: { checkins: { orderBy: { date: 'asc' } } },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map(({ checkins, ...c }) => ({
      ...c,
      checkinDates: checkins.map((k) => k.date),
      completedDays: checkins.length,
      streak: currentStreak(checkins.map((k) => k.date), req.query.today),
    }));
  });

  app.post('/', async (req, reply) =>
    reply
      .status(201)
      .send(await prisma.challenge.create({ data: { ...schema.parse(req.body), userId: req.user.uid } })),
  );

  app.put<{ Params: { id: string } }>('/:id', async (req) => {
    const where = { id: Number(req.params.id), userId: req.user.uid };
    const { count } = await prisma.challenge.updateMany({ where, data: schema.parse(req.body) });
    if (!count) throw notFound();
    return prisma.challenge.findFirst({ where });
  });

  app.delete<{ Params: { id: string } }>('/:id', async (req, reply) => {
    const { count } = await prisma.challenge.deleteMany({ where: { id: Number(req.params.id), userId: req.user.uid } });
    if (!count) throw notFound();
    return reply.status(204).send();
  });

  // Toggle a check-in for a date (defaults to today)
  app.post<{ Params: { id: string } }>('/:id/checkin', async (req) => {
    const challengeId = Number(req.params.id);
    const mine = await prisma.challenge.findFirst({ where: { id: challengeId, userId: req.user.uid }, select: { id: true } });
    if (!mine) throw notFound();
    const body = checkinSchema.safeParse(req.body ?? {});
    const date = body.success ? body.data.date : new Date(startOfToday());
    const existing = await prisma.challengeCheckin.findUnique({
      where: { challengeId_date: { challengeId, date } },
    });
    if (existing) {
      await prisma.challengeCheckin.delete({ where: { id: existing.id } });
      return { checkedIn: false };
    }
    await prisma.challengeCheckin.create({ data: { challengeId, date } });
    return { checkedIn: true };
  });
};
