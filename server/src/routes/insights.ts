import type { FastifyPluginAsync } from 'fastify';
import { prisma } from '../db.js';
import { bestRun } from './character.js';
import { currentStreak, startOfToday } from './challenges.js';

const DAY = 86_400_000;
const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const round1 = (n: number) => Math.round(n * 10) / 10;

/** Everything the dashboard charts need, in one round trip. All windows end on the client's "today". */
export const insightRoutes: FastifyPluginAsync = async (app) => {
  app.get<{ Querystring: { today?: string; tz?: string } }>('/', async (req) => {
    const userId = req.user.uid;
    const todayMs = startOfToday(req.query.today);
    const todayStr = iso(todayMs);
    // The browser's Date.getTimezoneOffset(): minutes *behind* UTC (IST is -330). Only used for timestamps like doneAt.
    const tz = Math.max(-840, Math.min(840, Number.isFinite(Number(req.query.tz)) ? Number(req.query.tz) : 0));

    const daysBack = (n: number) => Array.from({ length: n }, (_, i) => todayMs - (n - 1 - i) * DAY); // oldest -> today
    const monthsBack = (n: number) =>
      Array.from({ length: n }, (_, i) => {
        const d = new Date(todayMs);
        d.setUTCDate(1);
        d.setUTCMonth(d.getUTCMonth() - (n - 1 - i));
        return iso(d.getTime()).slice(0, 7);
      });
    const monthStart = (m: string) => new Date(`${m}-01T00:00:00Z`);

    const months6 = monthsBack(6);
    const months12 = monthsBack(12);
    const since = (n: number) => new Date(todayMs - (n - 1) * DAY);
    const weekCount = 8;
    const HEAT_DAYS = 105; // 15 weeks

    const [todos, tx, runs, workouts, body, food, user, diary, books, challenges, study, templeRows, screenRows, movieRows] = await Promise.all([
      prisma.todo.findMany({ where: { userId }, select: { done: true, dueDate: true, doneAt: true } }),
      prisma.transaction.findMany({ where: { userId, date: { gte: monthStart(months6[0]) } }, select: { type: true, amount: true, category: true, date: true } }),
      prisma.run.findMany({ where: { userId, date: { gte: since(HEAT_DAYS) } }, select: { date: true, rounds: true } }),
      prisma.workout.findMany({ where: { userId, date: { gte: since(HEAT_DAYS) } }, select: { date: true } }),
      prisma.bodyMetric.findMany({ where: { userId, date: { gte: since(HEAT_DAYS) } }, orderBy: { date: 'asc' }, select: { date: true, weightKg: true } }),
      prisma.foodEntry.findMany({ where: { userId, date: { gte: since(HEAT_DAYS) } }, select: { date: true, place: true, calories: true, meal: true } }),
      prisma.user.findUnique({ where: { id: userId }, select: { calorieGoal: true, screenLimitMin: true } }),
      prisma.diaryEntry.findMany({ where: { userId }, select: { date: true, mood: true } }),
      prisma.book.findMany({ where: { userId }, select: { status: true, finishedOn: true } }),
      prisma.challenge.findMany({ where: { userId }, include: { checkins: { select: { date: true } } } }),
      prisma.studySession.findMany({ where: { userId, date: { gte: since(HEAT_DAYS) } }, select: { date: true } }),
      prisma.templeVisit.findMany({ where: { userId }, select: { date: true, temple: true }, orderBy: [{ date: 'desc' }, { id: 'desc' }] }),
      prisma.screenTime.findMany({ where: { userId, date: { gte: since(HEAT_DAYS), lte: new Date(todayMs) } }, select: { date: true, app: true, minutes: true } }),
      prisma.movie.findMany({ where: { userId }, select: { kind: true, status: true, reaction: true, favorite: true, rating: true, platform: true, watchedOn: true } }),
    ]);

    // ---- "latest" details for the dashboard summary cards ----
    const [lastWorkout, workoutTotal, lastMeal, readingBooks, lastFinished, pagesAgg, lastDiary] = await Promise.all([
      prisma.workout.findFirst({ where: { userId }, orderBy: [{ date: 'desc' }, { id: 'desc' }], select: { title: true, date: true } }),
      prisma.workout.count({ where: { userId } }),
      prisma.foodEntry.findFirst({ where: { userId }, orderBy: [{ date: 'desc' }, { createdAt: 'desc' }], select: { name: true, meal: true, date: true } }),
      prisma.book.findMany({ where: { userId, status: 'READING' }, orderBy: { updatedAt: 'desc' }, take: 3, select: { id: true, title: true, totalPages: true, currentPage: true } }),
      prisma.book.findFirst({ where: { userId, status: 'FINISHED', moral: { not: null } }, orderBy: [{ finishedOn: { sort: 'desc', nulls: 'last' } }, { id: 'desc' }], select: { title: true, moral: true, finishedOn: true } }),
      prisma.book.aggregate({ where: { userId, status: 'FINISHED' }, _sum: { totalPages: true } }),
      prisma.diaryEntry.findFirst({ where: { userId }, orderBy: { date: 'desc' }, select: { date: true, mood: true, title: true, content: true } }),
    ]);

    // ---- to-dos ----
    const open = todos.filter((t) => !t.done);
    const doneLocalDay = (d: Date) => iso(d.getTime() - tz * 60_000);
    const todoStats = {
      open: open.length,
      overdue: open.filter((t) => t.dueDate && iso(t.dueDate.getTime()) < todayStr).length,
      done: todos.length - open.length,
      completedByDay: daysBack(14).map((ms) => ({
        date: iso(ms),
        count: todos.filter((t) => t.doneAt && doneLocalDay(t.doneAt) === iso(ms)).length,
      })),
    };

    // ---- money ----
    const monthOf = (d: Date) => iso(d.getTime()).slice(0, 7);
    const monthly = months6.map((m) => {
      const rows = tx.filter((t) => monthOf(t.date) === m);
      const sum = (type: string) => rows.filter((t) => t.type === type).reduce((s, t) => s + Number(t.amount), 0);
      return { month: m, income: sum('INCOME'), expense: sum('EXPENSE') };
    });
    const byCategory = new Map<string, number>();
    for (const t of tx) {
      if (t.type === 'EXPENSE' && monthOf(t.date) === months6[5]) byCategory.set(t.category, (byCategory.get(t.category) ?? 0) + Number(t.amount));
    }
    const ranked = [...byCategory.entries()].sort((a, b) => b[1] - a[1]);
    const categories = ranked.slice(0, 5).map(([name, amount]) => ({ name, amount }));
    const rest = ranked.slice(5).reduce((s, [, a]) => s + a, 0);
    if (rest > 0) categories.push({ name: 'Other', amount: rest });

    // ---- running / workouts / weight ----
    const runDays = daysBack(14).map((ms) => ({
      date: iso(ms),
      rounds: round1(runs.filter((r) => r.date.getTime() === ms).reduce((s, r) => s + r.rounds, 0)),
    }));
    const workoutWeeks = Array.from({ length: weekCount }, (_, w) => {
      const end = todayMs - (weekCount - 1 - w) * 7 * DAY; // oldest week first, newest ends today
      const start = end - 6 * DAY;
      return { start: iso(start), count: workouts.filter((x) => x.date.getTime() >= start && x.date.getTime() <= end).length };
    });

    // ---- food ----
    const food30 = food.filter((f) => f.date.getTime() >= todayMs - 29 * DAY);
    const foodDays = daysBack(14).map((ms) => {
      const rows = food.filter((f) => f.date.getTime() === ms);
      return { date: iso(ms), calories: rows.reduce((s, f) => s + (f.calories ?? 0), 0), meals: rows.length };
    });

    // ---- diary ----
    const last30 = diary.filter((d) => d.date.getTime() >= todayMs - 29 * DAY && d.date.getTime() <= todayMs);
    const moods: Record<string, number> = { GREAT: 0, GOOD: 0, OKAY: 0, LOW: 0, BAD: 0 };
    for (const d of last30) if (d.mood && d.mood in moods) moods[d.mood]++;

    // ---- books ----
    const bookMonths = months12.map((m) => ({
      month: m,
      finished: books.filter((b) => b.status === 'FINISHED' && b.finishedOn && monthOf(b.finishedOn) === m).length,
    }));

    // ---- temple: days gone (a day counts once however many temples you saw) ----
    const templeDays = [...new Set(templeRows.map((v) => iso(v.date.getTime())))].sort();
    const templePast = templeDays.filter((d) => d <= todayStr);
    const templeNames = new Map<string, { name: string; days: Set<string> }>(); // rows are newest first, so each temple shows as you last wrote it
    for (const v of templeRows) {
      const key = v.temple.trim().toLowerCase();
      const entry = templeNames.get(key) ?? { name: v.temple, days: new Set<string>() };
      entry.days.add(iso(v.date.getTime()));
      templeNames.set(key, entry);
    }
    const templeWeekdays = [0, 0, 0, 0, 0, 0, 0]; // Sunday first
    for (const d of templePast) templeWeekdays[new Date(`${d}T00:00:00Z`).getUTCDay()]++;
    const templeStats = {
      total: templePast.length,
      thisMonth: templePast.filter((d) => d.startsWith(todayStr.slice(0, 7))).length,
      streak: currentStreak(templeRows.map((v) => v.date), req.query.today),
      bestStreak: bestRun(templePast),
      months: months6.map((m) => ({ month: m, days: templePast.filter((d) => d.startsWith(m)).length })),
      weekdays: templeWeekdays,
      top: [...templeNames.values()].map((t) => ({ name: t.name, days: t.days.size })).sort((a, b) => b.days - a.days || a.name.localeCompare(b.name)).slice(0, 5),
    };

    // ---- screen time: minutes per day / per app ----
    const screenByDay = new Map<string, number>();
    const screenByApp: Record<string, number> = {}; // last 30 days
    for (const r of screenRows) {
      const key = iso(r.date.getTime());
      screenByDay.set(key, (screenByDay.get(key) ?? 0) + r.minutes);
      if (r.date.getTime() >= todayMs - 29 * DAY) screenByApp[r.app] = (screenByApp[r.app] ?? 0) + r.minutes;
    }
    const screenDays = daysBack(14).map((ms) => ({ date: iso(ms), minutes: screenByDay.get(iso(ms)) ?? 0 }));
    const screenLogged = screenDays.filter((d) => d.minutes > 0);
    const sumMin = (list: { minutes: number }[]) => list.reduce((s, d) => s + d.minutes, 0);
    const screenStats = {
      limit: user?.screenLimitMin ?? null,
      days: screenDays,
      loggedDays: screenLogged.length,
      avg: screenLogged.length ? Math.round(sumMin(screenLogged) / screenLogged.length) : 0, // over the days you logged, so a new user isn't averaged with empty days
      week: sumMin(screenDays.slice(7)),
      prevWeek: sumMin(screenDays.slice(0, 7)),
      byApp: screenByApp,
    };

    // ---- movies & series ----
    const watchedMovies = movieRows.filter((m) => m.status === 'WATCHED');
    const rated = watchedMovies.filter((m) => m.rating !== null);
    const platforms = new Map<string, { name: string; count: number }>();
    for (const m of movieRows) {
      const name = m.platform?.trim();
      if (!name || m.status === 'WANT') continue;
      const entry = platforms.get(name.toLowerCase()) ?? { name, count: 0 };
      entry.count++;
      platforms.set(name.toLowerCase(), entry);
    }
    const movieStats = {
      total: movieRows.length,
      watched: watchedMovies.length,
      watching: movieRows.filter((m) => m.status === 'WATCHING').length,
      want: movieRows.filter((m) => m.status === 'WANT').length,
      favorites: movieRows.filter((m) => m.favorite).length,
      reactions: {
        LOVED: movieRows.filter((m) => m.reaction === 'LOVED').length,
        OKAY: movieRows.filter((m) => m.reaction === 'OKAY').length,
        HATED: movieRows.filter((m) => m.reaction === 'HATED').length,
      },
      avgRating: rated.length ? round1(rated.reduce((s, m) => s + (m.rating ?? 0), 0) / rated.length) : null,
      movies: watchedMovies.filter((m) => m.kind === 'MOVIE').length,
      series: watchedMovies.filter((m) => m.kind === 'SERIES').length,
      months: months6.map((m) => ({ month: m, count: watchedMovies.filter((x) => x.watchedOn && monthOf(x.watchedOn) === m).length })),
      platforms: [...platforms.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)).slice(0, 5),
    };

    // ---- activity: which parts of the app you used each day (heatmap) ----
    const dayKey = (d: Date) => iso(d.getTime());
    const tasksPerDay = new Map<string, number>();
    for (const t of todos) if (t.doneAt) tasksPerDay.set(doneLocalDay(t.doneAt), (tasksPerDay.get(doneLocalDay(t.doneAt)) ?? 0) + 1);
    const setOf = (dates: Date[]) => new Set(dates.map(dayKey));
    const kinds = {
      run: setOf(runs.map((r) => r.date)),
      workout: setOf(workouts.map((w) => w.date)),
      food: setOf(food.map((f) => f.date)),
      diary: setOf(diary.map((d) => d.date)),
      weight: setOf(body.map((b) => b.date)),
      challenge: setOf(challenges.flatMap((c) => c.checkins.map((k) => k.date))),
      study: setOf(study.map((s) => s.date)),
      temple: setOf(templeRows.map((v) => v.date)),
      screen: setOf(screenRows.map((r) => r.date)),
      movie: setOf(watchedMovies.flatMap((m) => (m.watchedOn ? [m.watchedOn] : []))),
    };
    const activityDays = daysBack(HEAT_DAYS).map((ms) => {
      const date = iso(ms);
      const did: string[] = (Object.keys(kinds) as (keyof typeof kinds)[]).filter((k) => kinds[k].has(date));
      const tasks = tasksPerDay.get(date) ?? 0;
      if (tasks > 0) did.unshift('tasks');
      return { date, count: did.length, kinds: did, tasks };
    });
    const activeDates = activityDays.filter((d) => d.count > 0).map((d) => new Date(`${d.date}T00:00:00Z`));
    let best = 0;
    let run = 0;
    for (const d of activityDays) {
      run = d.count > 0 ? run + 1 : 0;
      best = Math.max(best, run);
    }

    const todayActivity = activityDays[activityDays.length - 1];
    const pendingToday = open.filter((t) => t.dueDate && iso(t.dueDate.getTime()) <= todayStr).length; // overdue + due today

    const foodToday = food.filter((f) => f.date.getTime() === todayMs);
    const year = todayStr.slice(0, 4);
    const summary = {
      body: {
        workoutsThisWeek: workouts.filter((w) => w.date.getTime() >= todayMs - 6 * DAY && w.date.getTime() <= todayMs).length,
        workoutsTotal: workoutTotal,
        lastWorkout: lastWorkout ? { title: lastWorkout.title, date: iso(lastWorkout.date.getTime()) } : null,
      },
      food: {
        today: {
          meals: foodToday.length,
          calories: foodToday.reduce((sum, f) => sum + (f.calories ?? 0), 0),
          home: foodToday.filter((f) => f.place === 'HOME').length,
          outside: foodToday.filter((f) => f.place === 'OUTSIDE').length,
          snacks: foodToday.filter((f) => f.meal === 'SNACK').length,
        },
        lastMeal: lastMeal ? { name: lastMeal.name, meal: lastMeal.meal, date: iso(lastMeal.date.getTime()) } : null,
      },
      books: {
        finishedThisYear: books.filter((b) => b.status === 'FINISHED' && b.finishedOn && iso(b.finishedOn.getTime()).startsWith(year)).length,
        pagesRead: pagesAgg._sum.totalPages ?? 0,
        reading: readingBooks.map((b) => ({
          id: b.id,
          title: b.title,
          pct: b.totalPages && b.currentPage != null ? Math.min(100, Math.round((b.currentPage / b.totalPages) * 100)) : null,
        })),
        lastFinished: lastFinished ? { title: lastFinished.title, moral: lastFinished.moral, finishedOn: lastFinished.finishedOn ? iso(lastFinished.finishedOn.getTime()) : null } : null,
      },
      diary: {
        last: lastDiary
          ? { date: iso(lastDiary.date.getTime()), mood: lastDiary.mood, title: lastDiary.title, excerpt: lastDiary.content.replace(/s+/g, ' ').trim().slice(0, 120) }
          : null,
        recentMoods: daysBack(7).map((ms) => {
          const row = diary.find((d) => d.date.getTime() === ms);
          return { date: iso(ms), wrote: !!row, mood: row?.mood ?? null };
        }),
      },
      challengesToday: challenges.map((c) => ({ id: c.id, doneToday: c.checkins.some((k) => iso(k.date.getTime()) === todayStr) })),
    };

    return {
      summary,
      today: {
        tasksDone: todoStats.completedByDay[13].count,
        tasksPending: pendingToday,
        calories: foodDays[13].calories,
        goal: user?.calorieGoal ?? null,
        wroteDiary: kinds.diary.has(todayStr),
        moved: kinds.run.has(todayStr) || kinds.workout.has(todayStr),
        loggedKinds: todayActivity.count,
      },
      activity: {
        days: activityDays,
        activeDays: activeDates.length,
        streak: currentStreak(activeDates, req.query.today),
        bestStreak: best,
      },
      todos: todoStats,
      money: {
        months: monthly,
        categories,
        thisMonth: { income: monthly[5].income, expense: monthly[5].expense },
      },
      running: { days: runDays, total14: round1(runDays.reduce((s, d) => s + d.rounds, 0)) },
      workouts: { weeks: workoutWeeks, total: workoutWeeks.reduce((s, w) => s + w.count, 0) },
      weight: {
        points: body.filter((b) => b.date.getTime() >= todayMs - 89 * DAY).map((b) => ({ date: iso(b.date.getTime()), weightKg: b.weightKg })),
      },
      food: {
        goal: user?.calorieGoal ?? null,
        days: foodDays,
        home: food30.filter((f) => f.place === 'HOME').length,
        outside: food30.filter((f) => f.place === 'OUTSIDE').length,
      },
      diary: {
        moods,
        entriesLast30: last30.length,
        streak: currentStreak(diary.map((d) => d.date), req.query.today),
        total: diary.length,
      },
      books: {
        months: bookMonths,
        finished: books.filter((b) => b.status === 'FINISHED').length,
        reading: books.filter((b) => b.status === 'READING').length,
        want: books.filter((b) => b.status === 'WANT').length,
      },
      challenges: challenges.map((c) => ({
        id: c.id,
        title: c.title,
        completedDays: c.checkins.length,
        targetDays: c.targetDays,
        streak: currentStreak(c.checkins.map((k) => k.date), req.query.today),
      })),
      temple: templeStats,
      screen: screenStats,
      movies: movieStats,
    };
  });
};
