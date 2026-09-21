import { ReactNode } from 'react';
import { money } from '../api';
import { fmtMinutes } from '../careerLogic';
import { SCREEN_APPS } from '../screenApps';
import { BarChart, Donut, HBars, LineChart } from './Charts';
import Heatmap, { Activity } from './Heatmap';
import Reveal from './Reveal';
import { TodayData } from './TodayRings';

interface DayVal { date: string }
/** The "latest" details behind the dashboard summary cards. */
export interface SummaryData {
  body: { workoutsThisWeek: number; workoutsTotal: number; lastWorkout: { title: string; date: string } | null };
  food: {
    today: { meals: number; calories: number; home: number; outside: number; snacks: number };
    lastMeal: { name: string; meal: string; date: string } | null;
  };
  books: {
    finishedThisYear: number;
    pagesRead: number;
    reading: { id: number; title: string; pct: number | null }[];
    lastFinished: { title: string; moral: string | null; finishedOn: string | null } | null;
  };
  diary: {
    last: { date: string; mood: string | null; title: string | null; excerpt: string } | null;
    recentMoods: { date: string; wrote: boolean; mood: string | null }[];
  };
  challengesToday: { id: number; doneToday: boolean }[];
}

export interface InsightsData {
  summary?: SummaryData;
  today?: TodayData & { loggedKinds: number };
  activity?: Activity;
  todos: { open: number; overdue: number; done: number; completedByDay: (DayVal & { count: number })[] };
  money: {
    months: { month: string; income: number; expense: number }[];
    categories: { name: string; amount: number }[];
    thisMonth: { income: number; expense: number };
  };
  running: { days: (DayVal & { rounds: number })[]; total14: number };
  workouts: { weeks: { start: string; count: number }[]; total: number };
  weight: { points: (DayVal & { weightKg: number })[] };
  food: { goal: number | null; days: (DayVal & { calories: number; meals: number })[]; home: number; outside: number };
  diary: { moods: Record<string, number>; entriesLast30: number; streak: number; total: number };
  books: { months: { month: string; finished: number }[]; finished: number; reading: number; want: number };
  challenges: { id: number; title: string; completedDays: number; targetDays: number; streak: number }[];
  // The three below are absent when the server is an older build.
  temple?: {
    total: number;
    thisMonth: number;
    streak: number;
    bestStreak: number;
    months: { month: string; days: number }[];
    weekdays: number[]; // days gone per weekday, Sunday first
    top: { name: string; days: number }[];
  };
  screen?: {
    limit: number | null;
    days: (DayVal & { minutes: number })[];
    loggedDays: number;
    avg: number;
    week: number;
    prevWeek: number;
    byApp: Record<string, number>; // last 30 days
  };
  movies?: {
    total: number;
    watched: number;
    watching: number;
    want: number;
    favorites: number;
    reactions: { LOVED: number; OKAY: number; HATED: number };
    avgRating: number | null;
    movies: number;
    series: number;
    months: { month: string; count: number }[];
    platforms: { name: string; count: number }[];
  };
}

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

// Everything is a calendar day / month string (YYYY-MM-DD / YYYY-MM): format in UTC so time zones can't shift it.
const at = (d: string) => new Date(`${d.length === 7 ? `${d}-01` : d}T00:00:00Z`);
const fmt = (d: string, o: Intl.DateTimeFormatOptions) => at(d).toLocaleDateString(undefined, { ...o, timeZone: 'UTC' });
const dayLabel = (d: string) => String(Number(d.slice(8, 10)));
const longDay = (d: string) => fmt(d, { weekday: 'long', day: 'numeric', month: 'short' });
const kcal = (n: number) => `${Math.round(n).toLocaleString()} kcal`;
const r1 = (n: number) => String(Math.round(n * 10) / 10);

const MOODS = [
  { key: 'GREAT', label: '😄 Great' },
  { key: 'GOOD', label: '🙂 Good' },
  { key: 'OKAY', label: '😐 Okay' },
  { key: 'LOW', label: '😔 Low' },
  { key: 'BAD', label: '😢 Bad' },
];

function Card({ title, sub, children, wide = false }: { title: string; sub?: string; children: ReactNode; wide?: boolean }) {
  return (
    <Reveal className={wide ? 'wide' : ''} minHeight={wide ? 230 : 220}>
      <div className="card insight">
        <div className="insight-head">
          <h3>{title}</h3>
          {sub && <span className="muted">{sub}</span>}
        </div>
        {children}
      </div>
    </Reveal>
  );
}
const Empty = ({ emoji, text }: { emoji: string; text: string }) => (
  <div className="insight-empty"><span aria-hidden>{emoji}</span> {text}</div>
);
const Label = ({ children }: { children: ReactNode }) => <div className="insight-sub">{children}</div>;

export default function Insights({ data, error, loading }: { data: InsightsData | null; error: string | null; loading: boolean }) {

  if (loading && !data) {
    return (
      <section className="insights">
        <h2 className="insights-title">📊 Your stats</h2>
        <div className="insights-grid">
          {[0, 1, 2, 3].map((i) => <span key={i} className="skeleton tall" style={{ height: 240 }} />)}
        </div>
      </section>
    );
  }
  if (error || !data) {
    return (
      <section className="insights">
        <h2 className="insights-title">📊 Your stats</h2>
        <div className="card muted">
          The stats charts need the latest server. Stop it and start it again (<code>npm run dev</code>), then refresh this page.
        </div>
      </section>
    );
  }

  const { todos, money: mo, running, workouts, weight, food, diary, books, challenges } = data;
  const saved = mo.thisMonth.income - mo.thisMonth.expense;

  const foodDays = food.days.filter((d) => d.calories > 0);
  const avgKcal = foodDays.length ? foodDays.reduce((s, d) => s + d.calories, 0) / foodDays.length : 0;
  const meals30 = food.home + food.outside;

  const firstW = weight.points[0];
  const lastW = weight.points[weight.points.length - 1];
  const wDiff = firstW && lastW ? lastW.weightKg - firstW.weightKg : 0;

  const onTrack = Math.max(0, todos.open - todos.overdue);
  const doneRecently = todos.completedByDay.reduce((s, d) => s + d.count, 0);

  return (
    <section className="insights">
      <h2 className="insights-title">📊 Your stats</h2>
      <div className="insights-grid">
        {data.activity && (
          <Card title="🗓️ Consistency" sub="last 15 weeks" wide>
            <Heatmap activity={data.activity} />
          </Card>
        )}

        <Card title="💰 Money" sub="last 6 months">
          <div className="insight-nums">
            <div><span>Income</span><strong className="pos">{money(mo.thisMonth.income)}</strong></div>
            <div><span>Spent</span><strong className="neg">{money(mo.thisMonth.expense)}</strong></div>
            <div><span>Saved</span><strong className={saved >= 0 ? 'pos' : 'neg'}>{money(saved)}</strong></div>
          </div>
          <div className="muted" style={{ marginTop: -4 }}>this month so far</div>
          {mo.months.some((m) => m.expense > 0) ? (
            <>
              <Label>Spent per month</Label>
              <BarChart
                height={170}
                label="Money spent per month"
                format={money}
                data={mo.months.map((m) => ({ label: fmt(m.month, { month: 'short' }), value: m.expense, caption: fmt(m.month, { month: 'long', year: 'numeric' }) }))}
              />
            </>
          ) : (
            <Empty emoji="💸" text="Add expenses to see your spending" />
          )}
          {mo.categories.length > 0 && (
            <>
              <Label>Where it went this month</Label>
              <HBars items={mo.categories.map((c) => ({ label: c.name, value: c.amount }))} format={money} />
            </>
          )}
        </Card>

        <Card title="🍽️ Calories" sub="last 14 days">
          {foodDays.length > 0 ? (
            <>
              <div className="insight-nums">
                <div><span>Daily average</span><strong>{kcal(avgKcal)}</strong></div>
                {food.goal && <div><span>Your goal</span><strong>{kcal(food.goal)}</strong></div>}
              </div>
              <BarChart
                height={180}
                label="Calories eaten per day"
                format={kcal}
                reference={food.goal ? { value: food.goal, label: `Goal ${Math.round(food.goal).toLocaleString()}` } : undefined}
                data={food.days.map((d) => ({ label: dayLabel(d.date), value: d.calories, caption: longDay(d.date) }))}
              />
              {!food.goal && <div className="muted" style={{ marginTop: 8 }}>Set a daily goal on the Food page to see it as a line here.</div>}
            </>
          ) : (
            <Empty emoji="🥗" text="Log meals with calories to see this" />
          )}
        </Card>

        <Card title="🏠 Home vs 🍴 outside" sub="meals, last 30 days">
          {meals30 > 0 ? (
            <Donut
              centerLabel="meals"
              slices={[
                { label: '🏠 Home', value: food.home, color: 'var(--series-1)' },
                { label: '🍴 Outside', value: food.outside, color: 'var(--amber)' },
              ]}
            />
          ) : (
            <Empty emoji="🍽️" text="Log where you eat to see the split" />
          )}
        </Card>

        <Card title="🏃 Rounds" sub="last 14 days">
          {running.total14 > 0 ? (
            <>
              <div className="insight-nums"><div><span>Total</span><strong>{r1(running.total14)} rounds</strong></div></div>
              <BarChart
                height={170}
                label="Rounds per day"
                format={(n) => `${r1(n)} ${n === 1 ? 'round' : 'rounds'}`}
                data={running.days.map((d) => ({ label: dayLabel(d.date), value: d.rounds, caption: longDay(d.date) }))}
              />
            </>
          ) : (
            <Empty emoji="👟" text="Log some rounds to see them here" />
          )}
        </Card>

        <Card title="⚖️ Weight" sub="last 90 days">
          {weight.points.length > 0 ? (
            <>
              <div className="insight-nums">
                <div><span>Now</span><strong>{lastW.weightKg} kg</strong></div>
                {weight.points.length > 1 && (
                  <div><span>Change</span><strong className={wDiff <= 0 ? 'pos' : 'neg'}>{wDiff > 0 ? '+' : ''}{wDiff.toFixed(1)} kg</strong></div>
                )}
              </div>
              <LineChart height={180} label="Body weight" format={(n) => `${n.toFixed(1)} kg`} data={weight.points.map((p) => ({ date: p.date, value: p.weightKg }))} />
            </>
          ) : (
            <Empty emoji="📉" text="Log your weight to see the trend" />
          )}
        </Card>

        <Card title="💪 Workouts" sub="per week, last 8 weeks">
          {workouts.total > 0 ? (
            <>
              <div className="insight-nums"><div><span>In 8 weeks</span><strong>{workouts.total}</strong></div></div>
              <BarChart
                height={170}
                label="Workouts per week"
                format={(n) => `${n} ${n === 1 ? 'workout' : 'workouts'}`}
                data={workouts.weeks.map((w) => ({ label: fmt(w.start, { day: 'numeric', month: 'short' }), value: w.count, caption: `Week from ${fmt(w.start, { day: 'numeric', month: 'short' })}` }))}
              />
            </>
          ) : (
            <Empty emoji="🏋️" text="Log a workout to see your weeks" />
          )}
        </Card>

        <Card title="✅ To-do" sub="all tasks">
          {todos.open + todos.done > 0 ? (
            <>
              <Donut
                centerLabel="tasks"
                slices={[
                  { label: 'Done', value: todos.done, color: 'var(--green)' },
                  { label: 'Open', value: onTrack, color: 'var(--series-1)' },
                  { label: 'Overdue', value: todos.overdue, color: 'var(--red)' },
                ]}
              />
              {doneRecently > 0 && (
                <>
                  <Label>Finished per day · last 14 days ({doneRecently})</Label>
                  <BarChart
                    height={140}
                    label="Tasks finished per day"
                    format={(n) => `${n} ${n === 1 ? 'task' : 'tasks'}`}
                    data={todos.completedByDay.map((d) => ({ label: dayLabel(d.date), value: d.count, caption: longDay(d.date) }))}
                  />
                </>
              )}
            </>
          ) : (
            <Empty emoji="📝" text="Add tasks to see your progress" />
          )}
        </Card>

        <Card title="📔 Diary moods" sub="last 30 days">
          {diary.total > 0 ? (
            <>
              <div className="insight-nums">
                <div><span>Writing streak</span><strong>🔥 {diary.streak}</strong></div>
                <div><span>Entries (30 days)</span><strong>{diary.entriesLast30}</strong></div>
                <div><span>All time</span><strong>{diary.total}</strong></div>
              </div>
              <HBars items={MOODS.map((m) => ({ label: m.label, value: diary.moods[m.key] ?? 0 }))} format={(n) => String(n)} />
            </>
          ) : (
            <Empty emoji="📔" text="Write a diary entry to see your moods" />
          )}
        </Card>

        <Card title="📚 Books" sub="finished per month">
          {books.finished + books.reading + books.want > 0 ? (
            <>
              <div className="insight-nums">
                <div><span>Read</span><strong>{books.finished}</strong></div>
                <div><span>Reading</span><strong>{books.reading}</strong></div>
                <div><span>To read</span><strong>{books.want}</strong></div>
              </div>
              {books.finished > 0 && (
                <BarChart
                  height={150}
                  label="Books finished per month"
                  format={(n) => `${n} ${n === 1 ? 'book' : 'books'}`}
                  data={books.months.map((m) => ({ label: fmt(m.month, { month: 'short' }), value: m.finished, caption: fmt(m.month, { month: 'long', year: 'numeric' }) }))}
                />
              )}
            </>
          ) : (
            <Empty emoji="📚" text="Add a book to start your reading stats" />
          )}
        </Card>

        <Card title="🔥 Challenges" sub="progress">
          {challenges.length > 0 ? (
            challenges.map((c) => (
              <div key={c.id} style={{ marginBottom: 12 }}>
                <div className="row" style={{ justifyContent: 'space-between' }}>
                  <span>{c.title}</span>
                  <span className="muted">🔥 {c.streak} · {c.completedDays}/{c.targetDays}</span>
                </div>
                <div className="bar"><span style={{ width: `${Math.min(100, (c.completedDays / c.targetDays) * 100)}%` }} /></div>
              </div>
            ))
          ) : (
            <Empty emoji="🔥" text="Start a challenge to track it here" />
          )}
        </Card>

        {data.temple && (
          <Card title="🛕 Temple" sub="days gone">
            {data.temple.total > 0 ? (
              <>
                <div className="insight-nums">
                  <div><span>Days gone</span><strong>{data.temple.total}</strong></div>
                  <div><span>This month</span><strong>{data.temple.thisMonth}</strong></div>
                  <div><span>Streak</span><strong>🔥 {data.temple.streak}</strong></div>
                  <div><span>Best streak</span><strong>{data.temple.bestStreak}</strong></div>
                </div>
                <Label>Days per month</Label>
                <BarChart
                  height={150}
                  label="Days at the temple per month"
                  format={(n) => plural(n, 'day')}
                  data={data.temple.months.map((m) => ({ label: fmt(m.month, { month: 'short' }), value: m.days, caption: fmt(m.month, { month: 'long', year: 'numeric' }) }))}
                />
                <Label>Which days you go</Label>
                <HBars
                  items={WEEKDAYS.map((w, i) => ({ label: w, value: data.temple!.weekdays[(i + 1) % 7] }))}
                  format={(n) => String(n)}
                />
                {data.temple.top.length > 1 && (
                  <>
                    <Label>Your temples</Label>
                    <HBars items={data.temple.top.map((t) => ({ label: t.name, value: t.days }))} format={(n) => plural(n, 'day')} />
                  </>
                )}
              </>
            ) : (
              <Empty emoji="🛕" text="Log a visit to see your temple stats" />
            )}
          </Card>
        )}

        {data.screen && (() => {
          const s = data.screen;
          const total30 = Object.values(s.byApp).reduce((sum, m) => sum + m, 0);
          const delta = s.prevWeek > 0 ? Math.round(((s.week - s.prevWeek) / s.prevWeek) * 100) : null;
          return (
            <Card title="📱 Screen time" sub="last 14 days">
              {s.loggedDays > 0 ? (
                <>
                  <div className="insight-nums">
                    <div><span>Daily average</span><strong>{fmtMinutes(s.avg)}</strong></div>
                    <div><span>This week</span><strong>{fmtMinutes(s.week)}</strong></div>
                    {delta !== null && (
                      <div><span>vs last week</span><strong className={delta > 0 ? 'neg' : 'pos'}>{delta > 0 ? '▲' : '▼'} {Math.abs(delta)}%</strong></div>
                    )}
                  </div>
                  <div className="muted" style={{ marginTop: -4 }}>average over the {plural(s.loggedDays, 'day')} you logged</div>
                  <BarChart
                    height={180}
                    label="Screen time per day"
                    format={fmtMinutes}
                    reference={s.limit ? { value: s.limit, label: `Limit ${fmtMinutes(s.limit)}` } : undefined}
                    data={s.days.map((d) => ({ label: dayLabel(d.date), value: d.minutes, caption: longDay(d.date) }))}
                  />
                  {!s.limit && <div className="muted" style={{ marginTop: 8 }}>Set a daily limit on the Screen page to see it as a line here.</div>}
                  {total30 > 0 && (
                    <>
                      <Label>Where the time goes · last 30 days</Label>
                      <Donut
                        centerLabel="total"
                        format={fmtMinutes}
                        slices={SCREEN_APPS.filter((a) => (s.byApp[a.key] ?? 0) > 0).map((a) => ({ label: `${a.emoji} ${a.label}`, value: s.byApp[a.key], color: a.color }))}
                      />
                    </>
                  )}
                </>
              ) : (
                <Empty emoji="📱" text="Log your screen time to see this" />
              )}
            </Card>
          );
        })()}

        {data.movies && (() => {
          const m = data.movies;
          const reactions = m.reactions.LOVED + m.reactions.OKAY + m.reactions.HATED;
          return (
            <Card title="🎬 Movies & series" sub="watched, loved and hated" wide>
              {m.total > 0 ? (
                <div className="insight-cols">
                  <div>
                    <div className="insight-nums">
                      <div><span>Watched</span><strong>{m.watched}</strong></div>
                      <div><span>Watching</span><strong>{m.watching}</strong></div>
                      <div><span>To watch</span><strong>{m.want}</strong></div>
                      <div><span>⭐ Favorites</span><strong>{m.favorites}</strong></div>
                      {m.avgRating !== null && <div><span>Average rating</span><strong>{m.avgRating} ★</strong></div>}
                    </div>
                    {m.watched > 0 ? (
                      <>
                        <Label>Watched per month</Label>
                        <BarChart
                          height={160}
                          label="Movies and series watched per month"
                          format={(n) => `${n} watched`}
                          data={m.months.map((x) => ({ label: fmt(x.month, { month: 'short' }), value: x.count, caption: fmt(x.month, { month: 'long', year: 'numeric' }) }))}
                        />
                      </>
                    ) : (
                      <Empty emoji="🍿" text="Mark something as watched to see your months" />
                    )}
                  </div>
                  <div>
                    <Label>How you felt about them</Label>
                    {reactions > 0 ? (
                      <Donut
                        centerLabel="reactions"
                        slices={[
                          { label: '😍 Loved', value: m.reactions.LOVED, color: 'var(--green)' },
                          { label: '😐 Okay', value: m.reactions.OKAY, color: 'var(--amber)' },
                          { label: '🤮 Hated', value: m.reactions.HATED, color: 'var(--red)' },
                        ]}
                      />
                    ) : (
                      <Empty emoji="😍" text="Add a reaction to a title to see the split" />
                    )}
                    {m.watched > 0 && (
                      <>
                        <Label>Movies vs series</Label>
                        <HBars items={[{ label: '🎞️ Movies', value: m.movies }, { label: '📡 Series', value: m.series }]} format={(n) => String(n)} />
                      </>
                    )}
                    {m.platforms.length > 0 && (
                      <>
                        <Label>Where you watch</Label>
                        <HBars items={m.platforms.map((p) => ({ label: p.name, value: p.count }))} format={(n) => String(n)} />
                      </>
                    )}
                  </div>
                </div>
              ) : (
                <Empty emoji="🎬" text="Add a movie or series to start your stats" />
              )}
            </Card>
          );
        })()}
      </div>
    </section>
  );
}
