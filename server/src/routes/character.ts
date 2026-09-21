import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { prisma } from '../db.js';
import { httpError, notFound, parseDay } from '../http.js';
import { currentStreak, startOfToday } from './challenges.js';

const DAY = 86_400_000;
const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a YYYY-MM-DD date');
const blank = (s?: string | null) => s?.trim() || null; // "" and whitespace mean "not set"

const traitSchema = z.object({
  name: z.string().trim().min(1, 'Name the quality you want to grow').max(60),
  emoji: z.string().trim().min(1).max(16).default('⭐'),
  why: z.string().trim().max(500).nullish(),
});

const checkinSchema = z.object({
  traitId: z.number().int().positive(),
  date: day,
  done: z.boolean(),
  note: z.string().trim().max(500).nullish(),
});

const reflectionSchema = z.object({
  wins: z.string().trim().max(2000).nullish(),
  improve: z.string().trim().max(1000).nullish(),
  rating: z.number().int().min(1).max(5).nullish(),
});

/** Longest run of consecutive calendar days in a set of "YYYY-MM-DD" strings. */
export function bestRun(dates: string[]): number {
  const sorted = [...new Set(dates)].sort();
  let best = 0;
  let run = 0;
  let prev = NaN;
  for (const d of sorted) {
    const ms = Date.parse(d);
    run = ms - prev === DAY ? run + 1 : 1;
    prev = ms;
    best = Math.max(best, run);
  }
  return best;
}

export const characterRoutes: FastifyPluginAsync = async (app) => {
  const owned = (req: { params: unknown; user: { uid: number } }) => ({ id: Number((req.params as { id: string }).id), userId: req.user.uid });

  // ============================================================== traits
  app.post('/traits', async (req, reply) => {
    const userId = req.user.uid;
    const b = traitSchema.parse(req.body);
    if (await prisma.characterTrait.findFirst({ where: { userId, name: { equals: b.name, mode: 'insensitive' } } })) {
      throw httpError(409, `You already have "${b.name}"`);
    }
    return reply.status(201).send(await prisma.characterTrait.create({ data: { userId, name: b.name, emoji: b.emoji, why: blank(b.why) } }));
  });

  app.put('/traits/:id', async (req) => {
    const where = owned(req);
    const b = traitSchema.parse(req.body);
    const clash = await prisma.characterTrait.findFirst({ where: { userId: where.userId, id: { not: where.id }, name: { equals: b.name, mode: 'insensitive' } } });
    if (clash) throw httpError(409, `You already have "${b.name}"`);
    const { count } = await prisma.characterTrait.updateMany({ where, data: { name: b.name, emoji: b.emoji, why: blank(b.why) } });
    if (!count) throw notFound();
    return prisma.characterTrait.findFirst({ where });
  });

  // Deleting a quality also deletes its check-ins (they belong to it).
  app.delete('/traits/:id', async (req, reply) => {
    const { count } = await prisma.characterTrait.deleteMany({ where: owned(req) });
    if (!count) throw notFound();
    return reply.status(204).send();
  });

  // ============================================================== one day
  app.get<{ Querystring: { date?: string } }>('/day', async (req) => {
    const userId = req.user.uid;
    const date = parseDay(req.query.date ?? iso(startOfToday()));
    const [logs, reflection] = await Promise.all([
      prisma.characterLog.findMany({ where: { userId, date }, select: { traitId: true, note: true } }),
      prisma.characterReflection.findUnique({ where: { userId_date: { userId, date } }, select: { wins: true, improve: true, rating: true } }),
    ]);
    return { checkins: logs, reflection };
  });

  // Tick or untick a quality for a day. done=true creates/updates it (with an optional note), done=false removes it.
  app.put('/checkin', async (req) => {
    const userId = req.user.uid;
    const b = checkinSchema.parse(req.body);
    const trait = await prisma.characterTrait.findFirst({ where: { id: b.traitId, userId }, select: { id: true } });
    if (!trait) throw notFound();
    const date = parseDay(b.date);
    if (!b.done) {
      await prisma.characterLog.deleteMany({ where: { traitId: trait.id, userId, date } });
      return { traitId: trait.id, done: false, note: null };
    }
    const note = blank(b.note);
    const log = await prisma.characterLog.upsert({
      where: { traitId_date: { traitId: trait.id, date } },
      create: { userId, traitId: trait.id, date, note },
      update: { note },
    });
    return { traitId: trait.id, done: true, note: log.note };
  });

  // The day's reflection. Sending nothing at all removes it.
  app.put<{ Params: { date: string } }>('/reflection/:date', async (req) => {
    const userId = req.user.uid;
    const date = parseDay(req.params.date);
    const b = reflectionSchema.parse(req.body);
    const data = { wins: blank(b.wins), improve: blank(b.improve), rating: b.rating ?? null };
    if (!data.wins && !data.improve && data.rating === null) {
      await prisma.characterReflection.deleteMany({ where: { userId, date } });
      return { reflection: null };
    }
    const reflection = await prisma.characterReflection.upsert({
      where: { userId_date: { userId, date } },
      create: { userId, date, ...data },
      update: data,
      select: { wins: true, improve: true, rating: true },
    });
    return { reflection };
  });

  // ============================================================ overview
  app.get<{ Querystring: { today?: string } }>('/overview', async (req) => {
    const userId = req.user.uid;
    const todayMs = startOfToday(req.query.today);
    const todayStr = iso(todayMs);

    const [traits, logs, reflections] = await Promise.all([
      prisma.characterTrait.findMany({ where: { userId }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] }),
      prisma.characterLog.findMany({ where: { userId }, select: { traitId: true, date: true, note: true } }),
      prisma.characterReflection.findMany({ where: { userId }, orderBy: { date: 'desc' }, select: { date: true, wins: true, rating: true } }),
    ]);

    const cutoff30 = todayMs - 29 * DAY;
    const perTrait = traits.map((t) => {
      const mine = logs.filter((l) => l.traitId === t.id);
      const today = mine.find((l) => l.date.getTime() === todayMs);
      return {
        id: t.id,
        name: t.name,
        emoji: t.emoji,
        why: t.why,
        days: mine.length, // total days practised: this drives its level
        last30: mine.filter((l) => l.date.getTime() >= cutoff30 && l.date.getTime() <= todayMs).length,
        streak: currentStreak(mine.map((l) => l.date), req.query.today),
        practicedToday: !!today,
        todayNote: today?.note ?? null,
      };
    });

    const allDates = logs.map((l) => iso(l.date.getTime()));
    const days14 = Array.from({ length: 14 }, (_, i) => {
      const ms = todayMs - (13 - i) * DAY;
      return { date: iso(ms), count: logs.filter((l) => l.date.getTime() === ms).length };
    });

    const recentRatings = reflections.filter((r) => r.rating !== null && r.date.getTime() >= todayMs - 13 * DAY && r.date.getTime() <= todayMs);

    return {
      traits: perTrait,
      totals: {
        checkins: logs.length,
        reflections: reflections.length,
        streak: currentStreak(logs.map((l) => l.date), req.query.today), // days in a row with at least one quality practised
        bestStreak: bestRun(allDates),
        practicedToday: perTrait.filter((t) => t.practicedToday).length,
        reflectedToday: reflections.some((r) => r.date.getTime() === todayMs),
      },
      days14,
      averageRating14: recentRatings.length ? Math.round((recentRatings.reduce((s, r) => s + (r.rating ?? 0), 0) / recentRatings.length) * 10) / 10 : null,
      recentWins: reflections
        .filter((r) => r.wins)
        .slice(0, 5)
        .map((r) => ({ date: iso(r.date.getTime()), wins: r.wins as string, rating: r.rating })),
      today: todayStr,
    };
  });
};
