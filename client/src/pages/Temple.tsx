import { FormEvent, useEffect, useState } from 'react';
import { api, day, notify, templeChanged, thisMonth, today, useApi } from '../api';
import Burst from '../components/Burst';
import CountUp from '../components/CountUp';
import TempleReminder from '../components/TempleReminder';
import { useLeaving } from '../hooks';
import { useTemple } from '../temple';
import { sinceText } from '../templeLogic';

interface Visit { id: number; date: string; temple: string; note: string | null }

// All dates are calendar days stored as UTC midnight, so format them in UTC too.
const fmt = (d: string, opts: Intl.DateTimeFormatOptions) =>
  new Date(`${d}T00:00:00Z`).toLocaleDateString(undefined, { ...opts, timeZone: 'UTC' });
const monthLabel = (m: string) => fmt(`${m}-01`, { month: 'long', year: 'numeric' });
const shiftMonth = (m: string, delta: number) => {
  const [y, mo] = m.split('-').map(Number);
  return new Date(Date.UTC(y, mo - 1 + delta, 1)).toISOString().slice(0, 7);
};
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** One month as a calendar: the days you went are filled in. */
function Calendar({ month, visits, todayStr }: { month: string; visits: Visit[]; todayStr: string }) {
  const [y, m] = month.split('-').map(Number);
  const lead = new Date(Date.UTC(y, m - 1, 1)).getUTCDay(); // empty cells before the 1st (weeks start on Sunday)
  const length = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const temples = new Map<string, string[]>();
  for (const v of visits) temples.set(day(v.date), [...(temples.get(day(v.date)) ?? []), v.temple]);

  return (
    <div className="temple-cal" role="grid" aria-label={`Temple visits in ${monthLabel(month)}`}>
      {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((w, i) => <span key={i} className="dow" aria-hidden>{w}</span>)}
      {Array.from({ length: lead }, (_, i) => <span key={`b${i}`} />)}
      {Array.from({ length }, (_, i) => {
        const d = `${month}-${String(i + 1).padStart(2, '0')}`;
        const went = temples.get(d);
        return (
          <span
            key={d}
            role="gridcell"
            className={`cal-day ${went ? 'went' : ''} ${d === todayStr ? 'today' : ''} ${d > todayStr ? 'future' : ''}`}
            title={went ? `${fmt(d, { day: 'numeric', month: 'short' })}: ${went.join(', ')}` : undefined}
            aria-label={went ? `${d}: went to ${went.join(', ')}` : d}
          >
            {i + 1}
          </span>
        );
      })}
    </div>
  );
}

export default function Temple() {
  const t = today();
  const { stats, visitedToday } = useTemple();
  const [month, setMonth] = useState(thisMonth());
  const visits = useApi<Visit[]>(`/temple?month=${month}`);
  const { isLeaving, leave } = useLeaving();

  const [editId, setEditId] = useState<number | null>(null);
  const [temple, setTemple] = useState('');
  const [date, setDate] = useState(t);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [burst, setBurst] = useState(false);

  // Start the form with the temple you went to last time: logging a visit is then one tap.
  const lastTemple = stats?.lastTemple ?? '';
  useEffect(() => { if (!editId) setTemple((cur) => cur || lastTemple); }, [lastTemple, editId]);

  const changed = () => { visits.reload(); templeChanged(); };

  function reset() {
    setEditId(null);
    setTemple(lastTemple);
    setDate(t);
    setNote('');
  }

  function startEdit(v: Visit) {
    setEditId(v.id);
    setTemple(v.temple);
    setDate(day(v.date));
    setNote(v.note ?? '');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!temple.trim()) { notify('Which temple did you visit?', 'error'); return; }
    setSaving(true);
    try {
      const body = { date, temple: temple.trim(), note: note.trim() || null };
      if (editId) await api(`/temple/${editId}?today=${t}`, 'PUT', body);
      else await api(`/temple?today=${t}`, 'POST', body);
      notify(editId ? 'Visit updated' : 'Visit logged 🙏');
      if (!editId) { setBurst(true); setTimeout(() => setBurst(false), 900); }
      if (date.slice(0, 7) !== month) setMonth(date.slice(0, 7)); // show the month it was logged in
      reset();
      setTemple(temple.trim()); // keep it: most visits are to the same temple
      changed();
    } catch {
      /* the failure toast is shown by api() */
    } finally {
      setSaving(false);
    }
  }

  function remove(v: Visit) {
    if (!confirm(`Delete your visit to ${v.temple} on ${fmt(day(v.date), { day: 'numeric', month: 'long', year: 'numeric' })}?`)) return;
    leave(v.id, async () => {
      await api(`/temple/${v.id}`, 'DELETE');
      notify('Visit deleted');
      if (editId === v.id) reset();
      changed();
    }).catch(() => { /* toast already shown */ });
  }

  const list = visits.data ?? [];
  const daysThisMonth = new Set(list.map((v) => day(v.date))).size;

  return (
    <>
      <h1>Temple</h1>

      <div className={`card temple-hero ${visitedToday ? 'done' : ''}`}>
        <div className="temple-count">
          <span className="temple-emoji" aria-hidden>🛕</span>
          <div>
            <div className="value">{stats ? <CountUp value={stats.totalDays} /> : '–'}</div>
            <div className="muted">{stats?.totalDays === 1 ? 'day' : 'days'} at the temple so far</div>
          </div>
        </div>
        <div className="temple-status">
          {visitedToday ? <strong>✓ You went today 🙏</strong> : <strong>Not yet today</strong>}
          <div className="muted">
            {stats ? sinceText(stats.daysSinceLast) : ' '}
            {stats?.firstVisit && ` · since ${fmt(stats.firstVisit, { day: 'numeric', month: 'short', year: 'numeric' })}`}
          </div>
        </div>
      </div>

      <div className="grid g3">
        <div className="card stat">
          <div className="label">This month</div>
          <div className="value">{stats ? <CountUp value={stats.thisMonth} /> : '–'}</div>
        </div>
        <div className="card stat">
          <div className="label">Current streak</div>
          <div className="value">🔥 {stats ? <CountUp value={stats.streak} /> : '–'}</div>
        </div>
        <div className="card stat">
          <div className="label">Best streak</div>
          <div className="value">{stats ? <CountUp value={stats.bestStreak} /> : '–'}</div>
        </div>
      </div>

      <form className="card" onSubmit={save}>
        <div className="row" style={{ justifyContent: 'space-between', marginBottom: 10 }}>
          <h2 style={{ margin: 0 }}>{editId ? 'Edit visit' : 'I went to the temple'}</h2>
        </div>
        <div className="row">
          <input
            style={{ flex: '3 1 200px' }}
            placeholder="Which temple?"
            maxLength={80}
            list="temple-names"
            value={temple}
            onChange={(e) => setTemple(e.target.value)}
          />
          <datalist id="temple-names">
            {stats?.temples.map((x) => <option key={x.name} value={x.name} />)}
          </datalist>
          <input type="date" max={t} value={date} onChange={(e) => e.target.value && setDate(e.target.value)} aria-label="Visit date" />
        </div>
        <input
          style={{ width: '100%', marginTop: 10 }}
          placeholder="A note, a prayer, how it felt (optional)"
          maxLength={1000}
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
        <div className="row" style={{ marginTop: 12 }}>
          <button className="primary relative" disabled={saving}>
            {saving ? 'Saving…' : editId ? 'Save' : 'Log visit'}
            {burst && <Burst />}
          </button>
          {editId && <button type="button" onClick={reset}>Cancel</button>}
        </div>
      </form>

      <div className="card">
        <div className="month-nav">
          <button type="button" onClick={() => setMonth(shiftMonth(month, -1))} aria-label="Previous month">‹</button>
          <strong>{monthLabel(month)}</strong>
          <button type="button" onClick={() => setMonth(shiftMonth(month, 1))} disabled={month >= thisMonth()} aria-label="Next month">›</button>
        </div>
        <div className="muted" style={{ textAlign: 'center', marginBottom: 10 }}>
          {visits.data ? `You went ${plural(daysThisMonth, 'day')} this month` : ' '}
        </div>
        <Calendar month={month} visits={list} todayStr={t} />

        {visits.error && <div className="error">{visits.error}</div>}
        {visits.data && list.length === 0 && (
          <div className="empty"><span className="emoji">🛕</span>No visits in {monthLabel(month)}.</div>
        )}

        <ul className="list" style={{ marginTop: 12 }}>
          {list.map((v) => {
            const d = day(v.date);
            return (
              <li key={v.id} className={`entry ${isLeaving(v.id) ? 'leaving' : ''}`}>
                <div className="entry-date">
                  <span className="dow">{fmt(d, { weekday: 'short' })}</span>
                  <span className="dom">{fmt(d, { day: 'numeric' })}</span>
                  <span className="mon">{fmt(d, { month: 'short' })}</span>
                </div>
                <div className="grow">
                  <div className="entry-head"><strong>{v.temple}</strong></div>
                  {v.note && <p className="entry-text">{v.note}</p>}
                </div>
                <button className="ghost edit" onClick={() => startEdit(v)} aria-label="Edit visit">✎</button>
                <button className="ghost" onClick={() => remove(v)} aria-label="Delete visit">✕</button>
              </li>
            );
          })}
        </ul>
      </div>

      {stats && stats.temples.length > 0 && (
        <div className="card">
          <h2 style={{ marginTop: 0 }}>Your temples</h2>
          <ul className="list">
            {stats.temples.map((x) => (
              <li key={x.name}>
                <span className="grow">{x.name}</span>
                <span className="muted">{plural(x.days, 'day')}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <TempleReminder />
    </>
  );
}
