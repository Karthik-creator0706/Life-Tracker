import { CSSProperties, useMemo, useState } from 'react';
import { ActivityDay, describeDay, heatLevel, monthLabels, rowLabels } from '../heatLogic';

export interface Activity { days: ActivityDay[]; activeDays: number; streak: number; bestStreak: number }

/** 15 weeks x 7 days. Darker square = you used more parts of the app that day. */
export default function Heatmap({ activity }: { activity: Activity }) {
  const { days } = activity;
  const months = useMemo(() => monthLabels(days), [days]);
  const rows = useMemo(() => rowLabels(days), [days]);
  const [picked, setPicked] = useState<ActivityDay | null>(null);
  const cols = Math.ceil(days.length / 7);
  const last = days[days.length - 1];

  return (
    <div className="heat">
      <div className="insight-nums">
        <div><span>Active days</span><strong>{activity.activeDays} <small className="muted">of {days.length}</small></strong></div>
        <div><span>Current streak</span><strong>🔥 {activity.streak}</strong></div>
        <div><span>Best streak</span><strong>{activity.bestStreak}</strong></div>
      </div>

      <div className="heat-months" style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }} aria-hidden>
        {months.map((m, c) => (m ? <span key={c} style={{ gridColumn: c + 1 }}>{m}</span> : null))}
      </div>

      <div className="heat-body" onPointerLeave={() => setPicked(null)}>
        <div className="heat-rows" aria-hidden>
          {rows.map((r, i) => <span key={i}>{r}</span>)}
        </div>
        <div
          className="heat-grid"
          style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}
          role="img"
          aria-label={`Activity over the last ${cols} weeks: ${activity.activeDays} active days, current streak ${activity.streak}, best streak ${activity.bestStreak}.`}
        >
          {days.map((d, i) => (
            <span
              key={d.date}
              className={`heat-cell l${heatLevel(d.count)} ${d.date === last.date ? 'today' : ''} ${picked?.date === d.date ? 'picked' : ''}`}
              style={{ '--col': Math.floor(i / 7) } as CSSProperties}
              title={describeDay(d)}
              onPointerEnter={() => setPicked(d)}
              onClick={() => setPicked(d)}
            />
          ))}
        </div>
      </div>

      <div className="heat-foot">
        <span className="heat-picked">{picked ? describeDay(picked) : 'Tap or hover a square to see what you logged that day'}</span>
        <span className="heat-legend" aria-hidden>
          Less
          {[0, 1, 2, 3, 4, 5].map((l) => <i key={l} className={`heat-cell l${l}`} />)}
          More
        </span>
      </div>
    </div>
  );
}
