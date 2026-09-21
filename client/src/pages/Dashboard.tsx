import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, money, today, useApi } from '../api';
import { useAuth } from '../auth';
import CountUp from '../components/CountUp';
import Insights, { InsightsData } from '../components/Insights';
import Sparkline from '../components/Sparkline';
import SummaryCards, { CareerOverview, CharacterOverview, ScreenOverview } from '../components/SummaryCards';
import TodayRings from '../components/TodayRings';
import type { CareerTask } from '../careerLogic';
import type { Dash } from '../dashTypes';
import { RunRow, runningFromRows } from '../runningLogic';
import type { MovieLite } from '../summaryLogic';
import { useTemple } from '../temple';

const plain = { color: 'inherit', textDecoration: 'none' } as const;

function greeting() {
  const h = new Date().getHours();
  return h < 5 ? 'Still up' : h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}

export default function Dashboard() {
  const { user } = useAuth();
  const { data, error, loading } = useApi<Dash>(`/dashboard?today=${today()}`);
  const insights = useApi<InsightsData>(`/insights?today=${today()}&tz=${new Date().getTimezoneOffset()}`);
  const ins = insights.data;
  const careerOverview = useApi<CareerOverview>(`/career/overview?today=${today()}`);
  const careerTasks = useApi<CareerTask[]>(`/career/tasks?today=${today()}`);
  const character = useApi<CharacterOverview>(`/character/overview?today=${today()}`);
  const screen = useApi<ScreenOverview>(`/screen/overview?today=${today()}`);
  const movies = useApi<MovieLite[]>('/movies');
  const { stats: templeStats, visitedToday: templeToday } = useTemple(); // already loaded for the daily reminder

  // Only when the server didn't include `running`: fetch the run list to build that card from.
  const [rows, setRows] = useState<RunRow[] | null>(null);
  const needFallback = !!data && !data.running;
  useEffect(() => {
    if (!needFallback) return;
    api<RunRow[]>('/fitness/runs').then(setRows).catch(() => { /* card just stays hidden */ });
  }, [needFallback]);

  if (loading) {
    return (
      <>
        <h1>{greeting()} 👋</h1>
        <div className="grid g4">
          {[0, 1, 2, 3].map((i) => <span key={i} className="skeleton tall" style={{ height: 82 }} />)}
        </div>
        <span className="skeleton tall" style={{ height: 96, marginBottom: 16 }} />
        <span className="skeleton tall" style={{ height: 140 }} />
      </>
    );
  }
  if (error || !data) return <div className="error">{error ?? 'No data'} — is the server running?</div>;

  const run = data.running ?? (rows ? runningFromRows(rows, today()) : undefined);

  return (
    <>
      <h1>{greeting()}, {user?.name.split(' ')[0]} 👋</h1>

      <div className="grid g4">
        <Link to="/todos" className="card stat" style={plain}>
          <div className="label">Open tasks</div>
          <div className="value"><CountUp value={data.openTodos} /></div>
          {ins && <Sparkline values={ins.todos.completedByDay.map((d) => d.count)} />}
        </Link>
        <Link to="/money" className="card stat" style={plain}>
          <div className="label">Balance this month</div>
          <div className={`value ${data.money.balance >= 0 ? 'pos' : 'neg'}`}><CountUp value={data.money.balance} format={(n) => money(n)} /></div>
          {ins && <Sparkline values={ins.money.months.map((m) => m.income - m.expense)} />}
        </Link>
        <Link to="/fitness" className="card stat" style={plain}>
          <div className="label">Workouts (7 days)</div>
          <div className="value"><CountUp value={data.fitness.workoutsThisWeek} /></div>
          {ins && <Sparkline values={ins.workouts.weeks.map((w) => w.count)} />}
        </Link>
        <Link to="/fitness" className="card stat" style={plain}>
          <div className="label">Rounds this month</div>
          <div className="value"><CountUp value={data.fitness.roundsThisMonth} format={(n) => String(Math.round(n * 10) / 10)} /></div>
          {ins && <Sparkline values={ins.running.days.map((d) => d.rounds)} />}
        </Link>
      </div>

      {ins?.today && <TodayRings today={ins.today} />}

      {/* One summary card per area, all built the same way */}
      <SummaryCards dash={data} ins={ins} run={run} career={{ overview: careerOverview.data, tasks: careerTasks.data }} character={character.data}
        temple={templeStats && { ...templeStats, visitedToday: templeToday }} screen={screen.data} movies={movies.data}
      />

      <Insights data={insights.data} error={insights.error} loading={insights.loading} />
    </>
  );
}
