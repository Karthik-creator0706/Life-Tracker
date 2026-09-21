import { FormEvent, useEffect, useState } from 'react';
import { api, notify, today, useApi } from '../api';
import CountUp from '../components/CountUp';
import { AppKey, SCREEN_APPS as APPS } from '../screenApps';

type Minutes = Record<AppKey, number>;

interface Overview {
  today: { date: string; apps: Minutes; total: number };
  limitMin: number | null;
  days: { date: string; apps: Minutes; total: number }[]; // the last 14 days, oldest first
  weekTotal: number;
  weekAvg: number;
  lastWeekTotal: number;
  byApp: Minutes; // this week's minutes per app
  loggedDays: number;
  daysOverLimit: number | null;
}

const EMPTY: Record<AppKey, string> = { INSTAGRAM: '', YOUTUBE: '', GAMES: '', MOVIES: '', OTHER: '' };

/** 135 -> "2h 15m", 45 -> "45m", 120 -> "2h". */
const fmtMin = (m: number) => {
  const h = Math.floor(m / 60);
  const r = m % 60;
  return h ? (r ? `${h}h ${String(r).padStart(2, '0')}m` : `${h}h`) : `${r}m`;
};
const num = (s: string) => Math.max(0, Math.round(Number(s) || 0));
const shortDay = (d: string) =>
  new Date(`${d}T00:00:00Z`).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });

export default function Screen() {
  const t = today();
  const overview = useApi<Overview>(`/screen/overview?today=${t}`);
  const o = overview.data;

  const [date, setDate] = useState(t);
  const [vals, setVals] = useState<Record<AppKey, string>>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [limit, setLimit] = useState('');

  // Load whatever is already saved for the chosen day.
  useEffect(() => {
    let cancelled = false;
    api<{ entries: Minutes }>(`/screen/day/${date}`)
      .then(({ entries }) => {
        if (cancelled) return;
        setVals(Object.fromEntries(APPS.map((a) => [a.key, entries[a.key] ? String(entries[a.key]) : ''])) as Record<AppKey, string>);
      })
      .catch(() => { /* connection problems show in the summary below */ });
    return () => { cancelled = true; };
  }, [date]);

  useEffect(() => { if (o) setLimit(o.limitMin ? String(o.limitMin) : ''); }, [o?.limitMin]); // eslint-disable-line react-hooks/exhaustive-deps

  const formTotal = APPS.reduce((s, a) => s + num(vals[a.key]), 0);
  const bump = (k: AppKey, by: number) => setVals((v) => ({ ...v, [k]: String(Math.min(1440, num(v[k]) + by)) }));

  async function save(e: FormEvent) {
    e.preventDefault();
    if (formTotal > 1440) { notify('That is more than 24 hours', 'error'); return; }
    setSaving(true);
    try {
      const entries = Object.fromEntries(APPS.map((a) => [a.key, num(vals[a.key])]));
      await api(`/screen/day/${date}?today=${t}`, 'PUT', { entries });
      notify(date === t ? "Today's screen time saved 📱" : 'Screen time saved');
      overview.reload();
    } catch {
      /* the failure toast is shown by api() */
    } finally {
      setSaving(false);
    }
  }

  async function saveLimit(clear = false) {
    const minutes = num(limit);
    if (!clear && minutes < 15) { notify('Set a limit of at least 15 minutes', 'error'); return; }
    try {
      await api('/screen/limit', 'PUT', { screenLimitMin: clear ? null : minutes });
      notify(clear ? 'Limit removed' : `Daily limit set to ${fmtMin(minutes)}`);
      overview.reload();
    } catch {
      /* toast already shown */
    }
  }

  const limitMin = o?.limitMin ?? null;
  const over = !!o && limitMin !== null && o.today.total > limitMin;
  const scale = o ? Math.max(limitMin ?? 0, ...o.days.map((d) => d.total), 60) : 60; // the tallest bar (or the limit) fills the chart
  const weekDelta = o && o.lastWeekTotal > 0 ? Math.round(((o.weekTotal - o.lastWeekTotal) / o.lastWeekTotal) * 100) : null;

  return (
    <>
      <h1>Screen time</h1>

      <div className={`card screen-hero ${over ? 'over' : ''}`}>
        <div>
          <div className="muted">Today</div>
          <div className="screen-total">{o ? fmtMin(o.today.total) : '–'}</div>
        </div>
        <div className="screen-hero-side">
          {o && limitMin !== null ? (
            <>
              <strong>{over ? `⚠️ ${fmtMin(o.today.total - limitMin)} over your limit` : `${fmtMin(limitMin - o.today.total)} left of ${fmtMin(limitMin)}`}</strong>
              <div className="bar"><span style={{ width: `${Math.min(100, (o.today.total / limitMin) * 100)}%` }} /></div>
            </>
          ) : (
            <span className="muted">Set a daily limit below to see how much is left.</span>
          )}
        </div>
      </div>

      <div className="grid g3">
        <div className="card stat">
          <div className="label">This week</div>
          <div className="value">{o ? fmtMin(o.weekTotal) : '–'}</div>
          {weekDelta !== null && <div className={`muted delta ${weekDelta > 0 ? 'up' : 'down'}`}>{weekDelta > 0 ? '▲' : '▼'} {Math.abs(weekDelta)}% vs last week</div>}
        </div>
        <div className="card stat">
          <div className="label">Daily average</div>
          <div className="value">{o ? fmtMin(o.weekAvg) : '–'}</div>
        </div>
        <div className="card stat">
          <div className="label">{o?.daysOverLimit != null ? 'Days over limit' : 'Days logged'}</div>
          <div className="value">{o ? <CountUp value={o.daysOverLimit ?? o.loggedDays} /> : '–'}</div>
          <div className="muted">{o?.daysOverLimit != null ? 'in the last 7 days' : 'in the last 14 days'}</div>
        </div>
      </div>

      <form className="card" onSubmit={save}>
        <div className="row" style={{ justifyContent: 'space-between', marginBottom: 12 }}>
          <div style={{ minWidth: 0 }}>
            <h2 style={{ margin: 0 }}>{date === t ? "Log today's screen time" : `Log ${shortDay(date)}`}</h2>
            <div className="muted">Check Settings → Screen Time (iPhone) or Digital Wellbeing (Android), then type the minutes.</div>
          </div>
          <input type="date" max={t} value={date} onChange={(e) => e.target.value && setDate(e.target.value)} style={{ flex: '0 0 auto' }} aria-label="Day" />
        </div>

        <div className="screen-rows">
          {APPS.map((a) => (
            <div className="screen-row" key={a.key}>
              <span className="screen-app"><i style={{ background: a.color }} aria-hidden />{a.emoji} {a.label}</span>
              <input
                type="number"
                inputMode="numeric"
                min="0"
                max="1440"
                placeholder="0"
                value={vals[a.key]}
                onChange={(e) => setVals((v) => ({ ...v, [a.key]: e.target.value }))}
                aria-label={`${a.label} minutes`}
              />
              <span className="muted">min</span>
              <button type="button" onClick={() => bump(a.key, 15)} aria-label={`Add 15 minutes to ${a.label}`}>+15</button>
              <button type="button" onClick={() => bump(a.key, 60)} aria-label={`Add 1 hour to ${a.label}`}>+1h</button>
            </div>
          ))}
        </div>

        <div className="row" style={{ marginTop: 12, justifyContent: 'space-between' }}>
          <span className={formTotal > 1440 ? 'error' : 'muted'}>Total: <strong>{fmtMin(formTotal)}</strong></span>
          <button className="primary" disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
        </div>
      </form>

      <div className="card">
        <h2 style={{ marginTop: 0 }}>Last 14 days</h2>
        {overview.error && <div className="error">{overview.error}</div>}
        {!o && !overview.error && <span className="skeleton tall" style={{ height: 150 }} />}
        {o && (
          <>
            <div className="screen-plot" role="img" aria-label="Screen time per day for the last 14 days">
              {limitMin !== null && <span className="screen-limit" style={{ bottom: `${(limitMin / scale) * 100}%` }} title={`Limit ${fmtMin(limitMin)}`} />}
              {o.days.map((d) => (
                <button
                  type="button"
                  key={d.date}
                  className={`screen-col ${d.date === date ? 'picked' : ''}`}
                  title={`${shortDay(d.date)}: ${d.total ? fmtMin(d.total) : 'nothing logged'} (tap to edit)`}
                  onClick={() => { setDate(d.date); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
                >
                  <span className="screen-stack" style={{ height: `${(d.total / scale) * 100}%` }}>
                    {APPS.map((a) => d.apps[a.key] > 0 && <i key={a.key} style={{ flexGrow: d.apps[a.key], background: a.color }} />)}
                  </span>
                </button>
              ))}
            </div>
            <div className="screen-days" aria-hidden>
              {o.days.map((d) => <span key={d.date}>{d.date.slice(8)}</span>)}
            </div>
            <div className="chips" style={{ marginTop: 10 }}>
              {APPS.map((a) => <span key={a.key} className="screen-legend"><i style={{ background: a.color }} />{a.label}</span>)}
              {limitMin !== null && <span className="screen-legend"><i className="dash" />Limit</span>}
            </div>
          </>
        )}
      </div>

      {o && o.weekTotal > 0 && (
        <div className="card">
          <h2 style={{ marginTop: 0 }}>Where this week went</h2>
          <ul className="list">
            {APPS.filter((a) => o.byApp[a.key] > 0)
              .sort((a, b) => o.byApp[b.key] - o.byApp[a.key])
              .map((a) => {
                const pct = (o.byApp[a.key] / o.weekTotal) * 100;
                return (
                  <li key={a.key} style={{ display: 'block' }}>
                    <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'nowrap' }}>
                      <span>{a.emoji} {a.label}</span>
                      <span className="muted">{fmtMin(o.byApp[a.key])} · {Math.round(pct)}%</span>
                    </div>
                    <div className="bar"><span style={{ width: `${pct}%`, background: a.color }} /></div>
                  </li>
                );
              })}
          </ul>
        </div>
      )}

      <div className="card">
        <h2 style={{ marginTop: 0 }}>Daily limit</h2>
        <p className="muted" style={{ margin: '0 0 10px' }}>Total across all apps. You'll see how much is left today, and which days went over.</p>
        <div className="row">
          <input type="number" inputMode="numeric" min="15" max="1440" style={{ flex: '1 1 120px' }} placeholder="Minutes per day, e.g. 180" value={limit} onChange={(e) => setLimit(e.target.value)} aria-label="Daily limit in minutes" />
          <button type="button" className="primary" onClick={() => saveLimit()}>Set limit</button>
          {limitMin !== null && <button type="button" onClick={() => saveLimit(true)}>Remove</button>}
        </div>
      </div>
    </>
  );
}
