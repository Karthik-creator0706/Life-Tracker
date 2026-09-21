import { CSSProperties, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import Burst from './Burst';

export interface TodayData {
  tasksDone: number;
  tasksPending: number;
  calories: number;
  goal: number | null;
  wroteDiary: boolean;
  moved: boolean;
}

const SIZE = 92;
const STROKE = 10;
const R = (SIZE - STROKE) / 2;
const C = 2 * Math.PI * R;
const CELEBRATED_KEY = 'lt_celebrated';

function Ring({ pct, color, icon, label, sub, to, full }: { pct: number; color: string; icon: string; label: string; sub: string; to: string; full: boolean }) {
  const p = Math.max(0, Math.min(1, pct));
  return (
    <Link to={to} className="ring-item">
      <div className={`ring ${full ? 'full' : ''}`}>
        <svg viewBox={`0 0 ${SIZE} ${SIZE}`} width="100%" aria-hidden>
          <g transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}>
            <circle className="ring-track" cx={SIZE / 2} cy={SIZE / 2} r={R} fill="none" strokeWidth={STROKE} />
            <circle
              className="ring-bar"
              cx={SIZE / 2}
              cy={SIZE / 2}
              r={R}
              fill="none"
              strokeWidth={STROKE}
              strokeDasharray={C}
              style={{ stroke: color, strokeDashoffset: C * (1 - p), opacity: p > 0 ? 1 : 0, ['--c' as string]: C } as CSSProperties}
            />
          </g>
        </svg>
        <span className="ring-icon" aria-hidden>{icon}</span>
        {full && <span className="ring-check" aria-hidden>✓</span>}
      </div>
      <div className="ring-label">{label}</div>
      <div className="ring-sub">{sub}</div>
    </Link>
  );
}

/** Today at a glance: four rings that fill as you get things done. */
export default function TodayRings({ today }: { today: TodayData }) {
  const total = today.tasksDone + today.tasksPending;
  const tasksPct = total === 0 ? 0 : today.tasksDone / total;
  const goal = today.goal;
  const overGoal = goal != null && today.calories > goal;
  const kcalPct = goal ? Math.min(1, today.calories / goal) : 0;

  // "Day complete": nothing left to do, diary written, and you moved. Calories are deliberately not part of it.
  const tasksOk = total === 0 || today.tasksDone >= total;
  const dayDone = tasksOk && today.wroteDiary && today.moved;

  const [celebrate, setCelebrate] = useState(false);
  useEffect(() => {
    if (!dayDone) return;
    const key = new Date().toLocaleDateString('en-CA');
    try {
      if (localStorage.getItem(CELEBRATED_KEY) === key) return; // once per day is a treat, every visit is noise
      localStorage.setItem(CELEBRATED_KEY, key);
    } catch { /* storage blocked: celebrate anyway */ }
    setCelebrate(true);
    const t = setTimeout(() => setCelebrate(false), 1400);
    return () => clearTimeout(t);
  }, [dayDone]);

  return (
    <div className="card today-card relative">
      <h2>🎯 Today</h2>
      <div className="rings">
        <Ring
          to="/todos"
          icon="✅"
          label="Tasks"
          pct={tasksPct}
          full={total > 0 && today.tasksDone >= total}
          color={total > 0 && today.tasksDone >= total ? 'var(--green)' : 'var(--series-1)'}
          sub={total === 0 ? 'Nothing due' : `${today.tasksDone} of ${total} done`}
        />
        <Ring
          to="/food"
          icon="🍽️"
          label="Calories"
          pct={kcalPct}
          full={false}
          color={overGoal ? 'var(--red)' : 'var(--series-1)'}
          sub={goal ? `${today.calories.toLocaleString()} / ${goal.toLocaleString()}` : today.calories > 0 ? `${today.calories.toLocaleString()} kcal · no goal` : 'No goal set'}
        />
        <Ring to="/diary" icon="📔" label="Diary" pct={today.wroteDiary ? 1 : 0} full={today.wroteDiary} color="var(--green)" sub={today.wroteDiary ? 'Written today' : 'Not yet'} />
        <Ring to="/fitness" icon="🏃" label="Active" pct={today.moved ? 1 : 0} full={today.moved} color="var(--green)" sub={today.moved ? 'Moved today' : 'Not yet'} />
      </div>
      {dayDone && <div className="today-banner">🎉 Day complete — nicely done!</div>}
      {celebrate && <Burst />}
    </div>
  );
}
