import { money, today } from '../api';
import type { Dash } from '../dashTypes';
import type { Running } from '../runningLogic';
import { bucketTasks, CareerTask, fmtMinutes } from '../careerLogic';
import { levelInfo, overallXp } from '../characterLogic';
import { calorieStatus, challengeTotals, MovieLite, movieSummary, weightChange } from '../summaryLogic';
import { screenAppLabel } from '../screenApps';
import { sinceText, TempleStats } from '../templeLogic';
import CountUp from './CountUp';
import type { InsightsData } from './Insights';
import { MiniBar, MiniBars, SummaryCard } from './SummaryCard';

const MOOD: Record<string, string> = { GREAT: '😄', GOOD: '🙂', OKAY: '😐', LOW: '😔', BAD: '😢' };
const MEAL: Record<string, string> = { BREAKFAST: 'Breakfast', LUNCH: 'Lunch', DINNER: 'Dinner', SNACK: 'Snack' };

// All days/months here are calendar strings, so format them in UTC.
const at = (d: string) => new Date(`${d.length === 7 ? `${d}-01` : d}T00:00:00Z`);
const fmt = (d: string, o: Intl.DateTimeFormatOptions) => at(d).toLocaleDateString(undefined, { ...o, timeZone: 'UTC' });
const weekday = (d: string) => fmt(d, { weekday: 'short' });
const longDay = (d: string) => fmt(d, { weekday: 'long', day: 'numeric', month: 'short' });
const r1 = (n: number) => String(Math.round(n * 10) / 10);
const num = (n: number) => Math.round(n).toLocaleString();
const pace = (rounds: number, minutes: number) => {
  const p = minutes / rounds;
  const m = Math.floor(p);
  return `${m}:${String(Math.round((p - m) * 60)).padStart(2, '0')} /round`;
};

/** Progress bar row used in the Books and Challenges cards. */
const Progress = ({ label, right, pct }: { label: string; right: string; pct: number }) => (
  <div style={{ marginTop: 10 }}>
    <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'nowrap', gap: 12 }}>
      <span className="sum-ellipsis">{label}</span>
      <span className="muted" style={{ whiteSpace: 'nowrap' }}>{right}</span>
    </div>
    <div className="bar"><span style={{ width: `${Math.min(100, pct)}%` }} /></div>
  </div>
);

export interface CareerOverview {
  goalMinutes: number | null;
  streak: number;
  today: { minutes: number; topics: { topic: string; minutes: number }[] };
  week: { minutes: number };
  days: { date: string; minutes: number }[];
}

export interface CharacterOverview {
  traits: { id: number; name: string; emoji: string; practicedToday: boolean }[];
  totals: { checkins: number; reflections: number; streak: number; practicedToday: number; reflectedToday: boolean };
  days14: { date: string; count: number }[];
}

export interface ScreenOverview {
  today: { total: number };
  limitMin: number | null;
  days: { date: string; total: number }[]; // the last 14 days, oldest first
  weekTotal: number;
  weekAvg: number;
  byApp: Record<string, number>; // this week's minutes per app
}

const REACTION: Record<string, string> = { LOVED: '😍', OKAY: '😐', HATED: '🤮' };

export default function SummaryCards({ dash, ins, run, career, character, temple, screen, movies }: {
  dash: Dash;
  ins: InsightsData | null;
  run?: Running;
  career?: { overview: CareerOverview | null; tasks: CareerTask[] | null };
  character?: CharacterOverview | null;
  temple?: TempleStats | null;
  screen?: ScreenOverview | null;
  movies?: MovieLite[] | null;
}) {
  const t = today();
  const sm = ins?.summary;

  // ---------------------------------------------------------------- Running
  const runningCard = run && (
    <SummaryCard
      key="run"
      to="/fitness?tab=run"
      title="🏃 Running"
      cta={run.sessions === 0 ? 'Add' : 'Open'}
      stats={[
        { label: 'Today', value: <CountUp value={run.today} format={r1} /> },
        { label: 'Last 7 days', value: <CountUp value={run.week} format={r1} /> },
        { label: 'This month', value: <CountUp value={run.month} format={r1} /> },
        { label: 'All time', value: <CountUp value={run.total} format={r1} /> },
      ]}
    >
      {run.sessions === 0 ? (
        <div className="empty" style={{ padding: '10px 0 0' }}><span className="emoji">👟</span>No rounds logged yet — tap to add your first</div>
      ) : (
        <>
          <MiniBars
            label="Rounds per day, last 7 days"
            items={run.days.map((d): MiniBar => ({ key: d.date, label: weekday(d.date), value: d.rounds, title: `${longDay(d.date)}: ${r1(d.rounds)} ${d.rounds === 1 ? 'round' : 'rounds'}` }))}
          />
          <div className="sum-foot">
            {run.last && <>Last: <strong>{r1(run.last.rounds)} {run.last.rounds === 1 ? 'round' : 'rounds'}</strong> in {run.last.durationMin} min · {pace(run.last.rounds, run.last.durationMin)} · {longDay(run.last.date)}<br /></>}
            {run.sessions} {run.sessions === 1 ? 'session' : 'sessions'} in total{run.total > 0 ? ` · average ${pace(run.total, run.totalMinutes)}` : ''}
          </div>
        </>
      )}
    </SummaryCard>
  );

  // ------------------------------------------------------------------- Body
  const points = ins?.weight.points ?? [];
  const lastWeight = points[points.length - 1];
  const change = weightChange(points, t);
  const bodyCard = ins && (
    <SummaryCard
      key="body"
      to="/fitness"
      title="💪 Body"
      stats={[
        { label: 'Weight', value: lastWeight ? `${lastWeight.weightKg} kg` : '–' },
        { label: '30-day change', value: change === null ? '–' : `${change > 0 ? '+' : ''}${change.toFixed(1)} kg`, tone: change === null ? undefined : change <= 0 ? 'pos' : 'neg' },
        { label: 'Workouts (7d)', value: sm ? sm.body.workoutsThisWeek : dash.fitness.workoutsThisWeek },
        { label: 'All workouts', value: sm ? sm.body.workoutsTotal : '–' },
      ]}
    >
      <MiniBars
        label="Workouts per week, last 8 weeks"
        items={ins.workouts.weeks.map((w): MiniBar => ({ key: w.start, label: fmt(w.start, { day: 'numeric', month: 'short' }), value: w.count, title: `Week from ${fmt(w.start, { day: 'numeric', month: 'short' })}: ${w.count} ${w.count === 1 ? 'workout' : 'workouts'}` }))}
      />
      <div className="sum-foot">
        {sm?.body.lastWorkout
          ? <>Last workout: <strong>{sm.body.lastWorkout.title}</strong> · {longDay(sm.body.lastWorkout.date)}</>
          : 'No workouts logged yet — tap to add one'}
      </div>
    </SummaryCard>
  );

  // ------------------------------------------------------------------- Food
  const goal = ins?.food.goal ?? null;
  const ft = sm?.food.today;
  const eaten = ft?.calories ?? ins?.today?.calories ?? 0;
  const cal = calorieStatus(eaten, goal);
  const foodCard = ins && (
    <SummaryCard
      key="food"
      to="/food"
      title="🍽️ Food"
      stats={[
        { label: 'Calories today', value: <CountUp value={eaten} format={num} /> },
        cal.kind === 'none'
          ? { label: 'Goal', value: 'Not set', small: true }
          : { label: cal.kind === 'over' ? 'Over goal' : 'Left today', value: num(cal.amount), tone: cal.kind === 'over' ? 'neg' : undefined },
        { label: 'Meals today', value: ft ? ft.meals : '–' },
        { label: '🏠 · 🍴', value: ft ? `${ft.home} · ${ft.outside}` : '–' },
      ]}
    >
      {cal.kind !== 'none' && <div className="bar cal-bar" style={{ marginTop: 12 }}><span className={cal.kind === 'over' ? 'over' : ''} style={{ width: `${cal.pct}%` }} /></div>}
      <MiniBars
        label="Calories per day, last 7 days"
        items={ins.food.days.slice(-7).map((d): MiniBar => ({ key: d.date, label: weekday(d.date), value: d.calories, title: `${longDay(d.date)}: ${num(d.calories)} kcal` }))}
      />
      <div className="sum-foot">
        {sm?.food.lastMeal ? <>Last: <strong>{sm.food.lastMeal.name}</strong> · {MEAL[sm.food.lastMeal.meal] ?? sm.food.lastMeal.meal}</> : 'Nothing logged yet — tap to add a meal'}
        {ft && ft.snacks > 0 && <> · 🍿 {ft.snacks} {ft.snacks === 1 ? 'snack' : 'snacks'} today</>}
      </div>
    </SummaryCard>
  );

  // ------------------------------------------------------------------ Money
  const top = ins?.money.categories[0];
  const saved = dash.money.balance;
  const moneyCard = (
    <SummaryCard
      key="money"
      to="/money"
      title="💰 Money"
      stats={[
        { label: 'Income', value: <CountUp value={dash.money.income} format={money} />, tone: 'pos' },
        { label: 'Spent', value: <CountUp value={dash.money.expense} format={money} />, tone: 'neg' },
        { label: 'Saved', value: <CountUp value={saved} format={money} />, tone: saved >= 0 ? 'pos' : 'neg' },
      ]}
    >
      {ins && ins.money.months.some((m) => m.expense > 0) && (
        <MiniBars
          label="Spent per month, last 6 months"
          items={ins.money.months.map((m): MiniBar => ({ key: m.month, label: fmt(m.month, { month: 'short' }), value: m.expense, title: `${fmt(m.month, { month: 'long', year: 'numeric' })}: ${money(m.expense)} spent` }))}
        />
      )}
      <div className="sum-foot">
        {top ? <>Biggest spend this month: <strong>{top.name}</strong> · {money(top.amount)}</> : 'This month so far'}
      </div>
    </SummaryCard>
  );

  // ------------------------------------------------------------------ Books
  const b = ins?.books;
  const bs = sm?.books;
  const booksCard = ins && b && (
    <SummaryCard
      key="books"
      to="/books"
      title="📚 Books"
      stats={[
        { label: 'Books read', value: <CountUp value={b.finished} /> },
        { label: 'This year', value: bs ? bs.finishedThisYear : '–' },
        { label: 'Reading now', value: b.reading },
        { label: 'Pages read', value: bs ? num(bs.pagesRead) : '–' },
      ]}
    >
      {b.finished > 0 && (
        <MiniBars
          label="Books finished per month, last 6 months"
          items={b.months.slice(-6).map((m): MiniBar => ({ key: m.month, label: fmt(m.month, { month: 'short' }), value: m.finished, title: `${fmt(m.month, { month: 'long', year: 'numeric' })}: ${m.finished} ${m.finished === 1 ? 'book' : 'books'}` }))}
        />
      )}
      {bs?.reading.slice(0, 2).map((r) => (
        <Progress key={r.id} label={`📖 ${r.title}`} right={r.pct === null ? 'reading' : `${r.pct}%`} pct={r.pct ?? 0} />
      ))}
      {bs?.lastFinished?.moral ? (
        <blockquote className="moral sum-moral">
          <span className="moral-tag">💡 Latest moral · {bs.lastFinished.title}</span>
          <p className="clamped">{bs.lastFinished.moral}</p>
        </blockquote>
      ) : (
        <div className="sum-foot">{b.finished + b.reading + b.want === 0 ? 'No books yet — tap to add the one you are reading' : 'Add a moral when you finish a book to see it here'}</div>
      )}
    </SummaryCard>
  );

  // ------------------------------------------------------------------ Diary
  const dd = dash.diary;
  const sd = sm?.diary;
  const diaryCard = (
    <SummaryCard
      key="diary"
      to="/diary"
      title="📔 Diary"
      cta={dd.wroteToday ? 'Open' : 'Write'}
      stats={[
        { label: 'Streak', value: `🔥 ${dd.streak}` },
        { label: 'Last 30 days', value: ins ? ins.diary.entriesLast30 : '–' },
        { label: 'All time', value: dd.total },
        { label: 'Today', value: dd.wroteToday ? '✓ Written' : 'Not yet', tone: dd.wroteToday ? 'pos' : undefined, small: true },
      ]}
    >
      {sd && (
        <div className="mood-strip" role="img" aria-label="Your mood over the last 7 days">
          {sd.recentMoods.map((d) => (
            <div key={d.date} title={`${longDay(d.date)}: ${d.wrote ? (d.mood ? d.mood.toLowerCase() : 'written, no mood') : 'no entry'}`}>
              <span className={`mood-dot ${d.wrote ? '' : 'none'}`}>{d.wrote ? (d.mood ? MOOD[d.mood] : '📝') : '·'}</span>
              <span className="mini-day">{weekday(d.date)}</span>
            </div>
          ))}
        </div>
      )}
      <div className="sum-foot">
        {!dd.wroteToday && <>✍️ <strong>Today's page is waiting.</strong><br /></>}
        {sd?.last
          ? <>Last entry: {longDay(sd.last.date)} {sd.last.mood && MOOD[sd.last.mood]} — <span className="sum-ellipsis-inline">{sd.last.title || sd.last.excerpt}</span></>
          : dd.total === 0 ? 'Write your first entry' : null}
      </div>
    </SummaryCard>
  );

  // ------------------------------------------------------------- Challenges
  const ct = challengeTotals(dash.challenges, sm?.challengesToday);
  const challengesCard = (
    <SummaryCard
      key="challenges"
      to="/challenges"
      title="🔥 Challenges"
      wide
      stats={[
        { label: 'Active', value: ct.active },
        { label: 'Best streak', value: `🔥 ${ct.bestStreak}` },
        { label: 'Days done', value: ct.daysDone },
        { label: 'Checked in today', value: ct.checkedIn ?? '–' },
      ]}
    >
      {dash.challenges.length === 0 ? (
        <div className="empty" style={{ padding: '10px 0 0' }}><span className="emoji">🔥</span>None running — tap to start one</div>
      ) : (
        dash.challenges.map((c) => {
          const done = sm?.challengesToday.find((x) => x.id === c.id)?.doneToday;
          return <Progress key={c.id} label={`${done ? '✓ ' : ''}${c.title}`} right={`🔥 ${c.streak} · ${c.completedDays}/${c.targetDays}`} pct={(c.completedDays / c.targetDays) * 100} />;
        })
      )}
    </SummaryCard>
  );

  // ----------------------------------------------------------------- Career
  const co = career?.overview;
  const ctasks = career?.tasks;
  const cb = ctasks ? bucketTasks(ctasks, t) : null;
  const careerCard = co && (
    <SummaryCard
      key="career"
      to="/career"
      title="🎓 Career"
      stats={[
        { label: 'Studied today', value: fmtMinutes(co.today.minutes) },
        { label: 'Study streak', value: `🔥 ${co.streak}` },
        { label: 'Last 7 days', value: fmtMinutes(co.week.minutes) },
        { label: 'Tasks left today', value: cb ? cb.overdue.length + cb.today.length : '–' },
      ]}
    >
      <MiniBars
        label="Study minutes per day, last 7 days"
        items={co.days.slice(-7).map((d): MiniBar => ({ key: d.date, label: weekday(d.date), value: d.minutes, title: `${longDay(d.date)}: ${fmtMinutes(d.minutes)}` }))}
      />
      <div className="sum-foot">
        {co.today.topics.length > 0
          ? <>Today: <strong>{co.today.topics.slice(0, 3).map((x) => x.topic).join(', ')}</strong>{co.today.topics.length > 3 && ` +${co.today.topics.length - 3} more`}</>
          : 'Nothing studied yet today — tap to log a session'}
        {cb && (
          <>
            <br />
            📅 {cb.today.length + cb.overdue.length} today · 🗓️ {cb.week.length} this week · 🗂️ {cb.month.length} this month{cb.overdue.length > 0 && <span className="late-tag"> · ⚠️ {cb.overdue.length} overdue</span>}
          </>
        )}
      </div>
    </SummaryCard>
  );

  // -------------------------------------------------------------- Character
  const ch = character;
  const chLevel = ch ? levelInfo(overallXp(ch.totals.checkins, ch.totals.reflections)) : null;
  const characterCard = ch && chLevel && (
    <SummaryCard
      key="character"
      to="/character"
      title="🌟 Character"
      cta={ch.traits.length === 0 ? 'Start' : 'Open'}
      stats={[
        { label: 'Level', value: <><CountUp value={chLevel.level} /> · {chLevel.title}</>, small: true },
        { label: 'Practised today', value: ch.traits.length ? `${ch.totals.practicedToday}/${ch.traits.length}` : '–' },
        { label: 'Streak', value: `🔥 ${ch.totals.streak}` },
        { label: 'Reflection', value: ch.totals.reflectedToday ? '✓ Done' : 'Not yet', tone: ch.totals.reflectedToday ? 'pos' : undefined, small: true },
      ]}
    >
      {ch.traits.length === 0 ? (
        <div className="empty" style={{ padding: '10px 0 0' }}><span className="emoji">🌟</span>Pick the good qualities you want to grow</div>
      ) : (
        <>
          <div className="bar cal-bar" style={{ marginTop: 12 }}><span style={{ width: `${chLevel.pct}%` }} /></div>
          <MiniBars
            label="Qualities practised per day, last 7 days"
            items={ch.days14.slice(-7).map((d): MiniBar => ({ key: d.date, label: weekday(d.date), value: d.count, title: `${longDay(d.date)}: ${d.count} ${d.count === 1 ? 'quality' : 'qualities'}` }))}
          />
          <div className="sum-foot">
            {ch.traits.map((x) => <span key={x.id} title={x.name} style={{ opacity: x.practicedToday ? 1 : 0.4, marginRight: 4 }}>{x.emoji}</span>)}
            <br />
            {ch.totals.practicedToday < ch.traits.length ? 'Tap to practise today' : 'All practised today ✨'} · {chLevel.toNext} XP to level {chLevel.level + 1}
          </div>
        </>
      )}
    </SummaryCard>
  );

  // ----------------------------------------------------------------- Temple
  const templeCard = temple && (
    <SummaryCard
      key="temple"
      to="/temple"
      title="🛕 Temple"
      cta={temple.visitedToday ? 'Open' : 'Log'}
      stats={[
        { label: 'Days gone', value: <CountUp value={temple.totalDays} /> },
        { label: 'This month', value: temple.thisMonth },
        { label: 'Streak', value: `🔥 ${temple.streak}` },
        { label: 'Today', value: temple.visitedToday ? '✓ Went' : 'Not yet', tone: temple.visitedToday ? 'pos' : undefined, small: true },
      ]}
    >
      {temple.totalDays === 0 ? (
        <div className="empty" style={{ padding: '10px 0 0' }}><span className="emoji">🛕</span>No visits yet — tap to log your first</div>
      ) : (
        <>
          {temple.recent && (
            <MiniBars
              label="Temple visits per day, last 7 days"
              items={temple.recent.map((d): MiniBar => ({ key: d.date, label: weekday(d.date), value: d.count, title: `${longDay(d.date)}: ${d.count ? `went (${d.count} ${d.count === 1 ? 'temple' : 'temples'})` : 'not this day'}` }))}
            />
          )}
          <div className="sum-foot">
            {!temple.visitedToday && <>🙏 <strong>Not been today yet.</strong><br /></>}
            {sinceText(temple.daysSinceLast)}{temple.lastTemple && <> · {temple.lastTemple}</>}
            <br />
            Best streak: {temple.bestStreak} {temple.bestStreak === 1 ? 'day' : 'days'}
          </div>
        </>
      )}
    </SummaryCard>
  );

  // ----------------------------------------------------------------- Screen
  const sc = screen;
  const scLeft = sc && sc.limitMin ? sc.limitMin - sc.today.total : null;
  const scTop = sc ? Object.entries(sc.byApp).sort((a, b) => b[1] - a[1])[0] : undefined;
  const screenCard = sc && (
    <SummaryCard
      key="screen"
      to="/screen"
      title="📱 Screen time"
      cta={sc.today.total === 0 ? 'Log' : 'Open'}
      stats={[
        { label: 'Today', value: fmtMinutes(sc.today.total), tone: scLeft !== null && scLeft < 0 ? 'neg' : undefined },
        { label: 'Last 7 days', value: fmtMinutes(sc.weekTotal) },
        { label: 'Daily average', value: fmtMinutes(sc.weekAvg) },
        scLeft === null
          ? { label: 'Limit', value: 'Not set', small: true }
          : scLeft >= 0
            ? { label: 'Left today', value: fmtMinutes(scLeft) }
            : { label: 'Over limit', value: fmtMinutes(-scLeft), tone: 'neg' },
      ]}
    >
      {sc.limitMin !== null && (
        <div className="bar cal-bar" style={{ marginTop: 12 }}>
          <span className={sc.today.total > sc.limitMin ? 'over' : ''} style={{ width: `${Math.min(100, (sc.today.total / sc.limitMin) * 100)}%` }} />
        </div>
      )}
      {sc.weekTotal === 0 && sc.today.total === 0 ? (
        <div className="empty" style={{ padding: '10px 0 0' }}><span className="emoji">📱</span>Nothing logged yet — tap to add today's minutes</div>
      ) : (
        <>
          <MiniBars
            label="Screen time per day, last 7 days"
            items={sc.days.slice(-7).map((d): MiniBar => ({ key: d.date, label: weekday(d.date), value: d.total, title: `${longDay(d.date)}: ${fmtMinutes(d.total)}` }))}
          />
          <div className="sum-foot">
            {scTop && scTop[1] > 0 ? <>Most time this week: <strong>{screenAppLabel(scTop[0])}</strong> · {fmtMinutes(scTop[1])}</> : 'Nothing logged in the last 7 days'}
          </div>
        </>
      )}
    </SummaryCard>
  );

  // ----------------------------------------------------------------- Movies
  const mv = movies ? movieSummary(movies, t) : null;
  const moviesCard = mv && (
    <SummaryCard
      key="movies"
      to="/movies"
      title="🎬 Movies"
      wide
      cta={mv.total === 0 ? 'Add' : 'Open'}
      stats={[
        { label: 'Watched', value: <CountUp value={mv.watched} /> },
        { label: 'This year', value: mv.thisYear },
        { label: 'Watching now', value: mv.watching.length },
        { label: '⭐ Favorites', value: mv.favorites.length },
      ]}
    >
      {mv.total === 0 ? (
        <div className="empty" style={{ padding: '10px 0 0' }}><span className="emoji">🎬</span>Nothing here yet — tap to add the last movie you watched</div>
      ) : (
        <>
          {mv.watched > 0 && (
            <MiniBars
              label="Movies and series watched per month, last 6 months"
              items={mv.months.map((m): MiniBar => ({ key: m.month, label: fmt(m.month, { month: 'short' }), value: m.count, title: `${fmt(m.month, { month: 'long', year: 'numeric' })}: ${m.count} watched` }))}
            />
          )}
          <div className="sum-foot">
            {mv.watching.length > 0 && <>📺 Watching now: <strong>{mv.watching.slice(0, 3).map((m) => m.title).join(', ')}</strong>{mv.watching.length > 3 && ` +${mv.watching.length - 3} more`}<br /></>}
            {mv.lastWatched && (
              <>
                Last watched: <strong>{mv.lastWatched.title}</strong>
                {mv.lastWatched.reaction && ` ${REACTION[mv.lastWatched.reaction]}`}
                {mv.lastWatched.rating != null && ` · ${'★'.repeat(mv.lastWatched.rating)}`}
                <br />
              </>
            )}
            😍 {mv.loved} loved · 🤮 {mv.hated} hated
            {mv.favorites.length > 0 && <><br />⭐ <strong>{mv.favorites.slice(0, 4).map((m) => m.title).join(', ')}</strong>{mv.favorites.length > 4 && ` +${mv.favorites.length - 4} more`}</>}
          </div>
        </>
      )}
    </SummaryCard>
  );

  // The two-column grid stays gap-free: ten single cards (five rows), then Movies and Challenges take a full row each.
  return <div className="summary-grid">{[runningCard, bodyCard, foodCard, moneyCard, booksCard, careerCard, characterCard, diaryCard, templeCard, screenCard, moviesCard, challengesCard]}</div>;
}
