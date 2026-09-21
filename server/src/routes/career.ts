import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { prisma } from '../db.js';
import { notFound, parseDay } from '../http.js';
import { currentStreak, startOfToday } from './challenges.js';

const DAY = 86_400_000;
const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a YYYY-MM-DD date');
const blank = (s?: string | null) => s?.trim() || null; // "" and whitespace mean "not set"

const studySchema = z.object({
  date: day,
  topic: z.string().trim().min(1, 'What did you study?').max(120),
  subject: z.string().trim().max(60).nullish(),
  minutes: z.number().int().min(1, 'At least 1 minute').max(1440, 'A day only has 1440 minutes'),
  notes: z.string().trim().max(2000).nullish(),
});

const taskSchema = z.object({
  title: z.string().trim().min(1, 'What needs doing?').max(200),
  subject: z.string().trim().max(60).nullish(),
  dueDate: day,
});
const taskPatch = taskSchema.partial().extend({ done: z.boolean().optional() });

type StudyRow = { date: Date; topic: string; subject: string | null; minutes: number };

/** Topics merged case-insensitively, biggest time first. */
function topicsOf(rows: StudyRow[]) {
  const map = new Map<string, { topic: string; minutes: number; sessions: number }>();
  for (const r of rows) {
    const key = r.topic.toLowerCase();
    const hit = map.get(key);
    if (hit) { hit.minutes += r.minutes; hit.sessions++; }
    else map.set(key, { topic: r.topic, minutes: r.minutes, sessions: 1 });
  }
  return [...map.values()].sort((a, b) => b.minutes - a.minutes || a.topic.localeCompare(b.topic));
}
const total = (rows: StudyRow[]) => rows.reduce((s, r) => s + r.minutes, 0);

export const careerRoutes: FastifyPluginAsync = async (app) => {
  const owned = (req: { params: unknown; user: { uid: number } }) => ({ id: Number((req.params as { id: string }).id), userId: req.user.uid });

  // ================================================================ study log
  app.get<{ Querystring: { date?: string } }>('/study', async (req) =>
    prisma.studySession.findMany({
      where: { userId: req.user.uid, date: parseDay(req.query.date ?? iso(startOfToday())) },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    }),
  );

  const studyData = (b: z.infer<typeof studySchema>) => ({
    date: parseDay(b.date),
    topic: b.topic,
    subject: blank(b.subject),
    minutes: b.minutes,
    notes: blank(b.notes),
  });

  app.post('/study', async (req, reply) =>
    reply.status(201).send(await prisma.studySession.create({ data: { ...studyData(studySchema.parse(req.body)), userId: req.user.uid } })),
  );

  app.put('/study/:id', async (req) => {
    const where = owned(req);
    const { count } = await prisma.studySession.updateMany({ where, data: studyData(studySchema.parse(req.body)) });
    if (!count) throw notFound();
    return prisma.studySession.findFirst({ where });
  });

  app.delete('/study/:id', async (req, reply) => {
    const { count } = await prisma.studySession.deleteMany({ where: owned(req) });
    if (!count) throw notFound();
    return reply.status(204).send();
  });

  // ================================================================= tasks
  // Everything unfinished, plus what you finished in the last 7 days (so a done task doesn't vanish instantly).
  app.get<{ Querystring: { today?: string } }>('/tasks', async (req) =>
    prisma.careerTask.findMany({
      where: { userId: req.user.uid, OR: [{ done: false }, { doneAt: { gte: new Date(startOfToday(req.query.today) - 7 * DAY) } }] },
      orderBy: [{ dueDate: 'asc' }, { id: 'asc' }],
    }),
  );

  app.post('/tasks', async (req, reply) => {
    const b = taskSchema.parse(req.body);
    return reply.status(201).send(
      await prisma.careerTask.create({ data: { title: b.title, subject: blank(b.subject), dueDate: parseDay(b.dueDate), userId: req.user.uid } }),
    );
  });

  app.patch('/tasks/:id', async (req) => {
    const where = owned(req);
    const b = taskPatch.parse(req.body);
    const { count } = await prisma.careerTask.updateMany({
      where,
      data: {
        ...(b.title !== undefined ? { title: b.title } : {}),
        ...(b.subject !== undefined ? { subject: blank(b.subject) } : {}),
        ...(b.dueDate !== undefined ? { dueDate: parseDay(b.dueDate) } : {}),
        ...(b.done !== undefined ? { done: b.done, doneAt: b.done ? new Date() : null } : {}),
      },
    });
    if (!count) throw notFound();
    return prisma.careerTask.findFirst({ where });
  });

  app.delete('/tasks/:id', async (req, reply) => {
    const { count } = await prisma.careerTask.deleteMany({ where: owned(req) });
    if (!count) throw notFound();
    return reply.status(204).send();
  });

  // ================================================================= goal
  // Daily study target in minutes. { studyGoalMin: null } clears it.
  app.put('/goal', async (req) => {
    const { studyGoalMin } = z
      .object({ studyGoalMin: z.number().int().min(10, 'Goal must be at least 10 minutes').max(1440).nullable() })
      .parse(req.body);
    await prisma.user.update({ where: { id: req.user.uid }, data: { studyGoalMin } });
    return { studyGoalMin };
  });

  // ============================================================== overview
  app.get<{ Querystring: { today?: string } }>('/overview', async (req) => {
    const userId = req.user.uid;
    const todayMs = startOfToday(req.query.today);
    const monthStartMs = (() => {
      const d = new Date(todayMs);
      d.setUTCDate(1);
      return d.getTime();
    })();

    const [rows, dates, user] = await Promise.all([
      prisma.studySession.findMany({ where: { userId, date: { gte: new Date(todayMs - 89 * DAY) } }, select: { date: true, topic: true, subject: true, minutes: true } }),
      prisma.studySession.findMany({ where: { userId }, select: { date: true }, distinct: ['date'] }),
      prisma.user.findUnique({ where: { id: userId }, select: { studyGoalMin: true } }),
    ]);

    const between = (from: number, to: number) => rows.filter((r) => r.date.getTime() >= from && r.date.getTime() <= to);
    const period = (rs: StudyRow[]) => ({ minutes: total(rs), sessions: rs.length, topics: topicsOf(rs) });

    const days = Array.from({ length: 14 }, (_, i) => {
      const ms = todayMs - (13 - i) * DAY;
      return { date: iso(ms), minutes: total(rows.filter((r) => r.date.getTime() === ms)) };
    });

    const bySubject = new Map<string, number>();
    for (const r of between(todayMs - 29 * DAY, todayMs)) {
      const key = r.subject ?? 'General';
      bySubject.set(key, (bySubject.get(key) ?? 0) + r.minutes);
    }
    const subjects = [...bySubject.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([subject, minutes]) => ({ subject, minutes }));

    // topics you come back to most (newest use decides the suggested subject), for one-tap re-use
    const seen = new Map<string, { topic: string; subject: string | null; count: number }>();
    for (const r of [...rows].sort((a, b) => b.date.getTime() - a.date.getTime())) {
      const key = r.topic.toLowerCase();
      const hit = seen.get(key);
      if (hit) hit.count++;
      else seen.set(key, { topic: r.topic, subject: r.subject, count: 1 });
    }
    const recentTopics = [...seen.values()].sort((a, b) => b.count - a.count).slice(0, 10);

    return {
      goalMinutes: user?.studyGoalMin ?? null,
      streak: currentStreak(dates.map((d) => d.date), req.query.today),
      studyDays: dates.length,
      today: period(between(todayMs, todayMs)),
      week: period(between(todayMs - 6 * DAY, todayMs)),
      month: period(between(monthStartMs, todayMs)),
      days,
      subjects,
      recentTopics,
    };
  });
};
