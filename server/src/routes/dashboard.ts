import type { FastifyPluginAsync } from 'fastify';
import { prisma } from '../db.js';
import { currentStreak, startOfToday } from './challenges.js';

export const dashboardRoutes: FastifyPluginAsync = async (app) => {
  app.get<{ Querystring: { today?: string } }>('/', async (req) => {
    const now = new Date();
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const weekStart = new Date(Date.now() - 6 * 86_400_000);

    const userId = req.user.uid;

    const [openTodos, tx, workoutsThisWeek, runs, latestWeight, challenges, diaryDates] = await Promise.all([
      prisma.todo.count({ where: { userId, done: false } }),
      prisma.transaction.findMany({ where: { userId, date: { gte: monthStart } } }),
      prisma.workout.count({ where: { userId, date: { gte: weekStart } } }),
      prisma.run.findMany({ where: { userId, date: { gte: monthStart } } }),
      prisma.bodyMetric.findFirst({ where: { userId }, orderBy: { date: 'desc' } }),
      prisma.challenge.findMany({ where: { userId }, include: { checkins: true } }),
      prisma.diaryEntry.findMany({ where: { userId }, select: { date: true } }),
    ]);
    const todayMs = startOfToday(req.query.today);

    // Running: today / last 7 days / this month use the client's local date; the total covers everything.
    const DAY = 86_400_000;
    const weekStartMs = todayMs - 6 * DAY;
    const runMonthStart = new Date(todayMs);
    runMonthStart.setUTCDate(1);
    const [recentRuns, runTotals, lastRun] = await Promise.all([
      prisma.run.findMany({
        where: { userId, date: { gte: new Date(Math.min(weekStartMs, runMonthStart.getTime())) } },
        select: { date: true, rounds: true },
      }),
      prisma.run.aggregate({ where: { userId }, _sum: { rounds: true, durationMin: true }, _count: true }),
      prisma.run.findFirst({ where: { userId }, orderBy: [{ date: 'desc' }, { id: 'desc' }] }),
    ]);
    const round1 = (n: number) => Math.round(n * 10) / 10;
    const sumRounds = (rows: { rounds: number }[]) => round1(rows.reduce((sum, r) => sum + r.rounds, 0));
    const runDays = Array.from({ length: 7 }, (_, i) => {
      const ms = weekStartMs + i * DAY;
      return { date: new Date(ms).toISOString().slice(0, 10), rounds: sumRounds(recentRuns.filter((r) => r.date.getTime() === ms)) };
    });

    const income = tx.filter((t) => t.type === 'INCOME').reduce((s, t) => s + Number(t.amount), 0);
    const expense = tx.filter((t) => t.type === 'EXPENSE').reduce((s, t) => s + Number(t.amount), 0);

    return {
      openTodos,
      money: { income, expense, balance: income - expense },
      fitness: {
        workoutsThisWeek,
        roundsThisMonth: Math.round(runs.reduce((s, r) => s + r.rounds, 0) * 10) / 10,
        latestWeightKg: latestWeight?.weightKg ?? null,
      },
      running: {
        today: runDays[6].rounds,
        week: round1(runDays.reduce((sum, d) => sum + d.rounds, 0)),
        month: sumRounds(recentRuns.filter((r) => r.date >= runMonthStart && r.date.getTime() <= todayMs)),
        total: round1(runTotals._sum.rounds ?? 0),
        sessions: runTotals._count,
        totalMinutes: runTotals._sum.durationMin ?? 0,
        days: runDays,
        last: lastRun
          ? { date: lastRun.date.toISOString().slice(0, 10), rounds: lastRun.rounds, durationMin: lastRun.durationMin }
          : null,
      },
      diary: {
        wroteToday: diaryDates.some((d) => d.date.getTime() === todayMs),
        streak: currentStreak(diaryDates.map((d) => d.date), req.query.today),
        total: diaryDates.length,
      },
      challenges: challenges
        .filter((c) => c.checkins.length < c.targetDays)
        .map((c) => ({
          id: c.id,
          title: c.title,
          completedDays: c.checkins.length,
          targetDays: c.targetDays,
          streak: currentStreak(c.checkins.map((k) => k.date), req.query.today),
        })),
    };
  });
};
