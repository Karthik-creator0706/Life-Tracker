import { FormEvent, useState } from 'react';
import { api, day, notify, today, useApi } from '../api';
import Burst from '../components/Burst';
import { useLeaving } from '../hooks';

interface Challenge {
  id: number;
  title: string;
  description: string | null;
  startDate: string;
  targetDays: number;
  completedDays: number;
  streak: number;
  checkinDates: string[];
}

export default function Challenges() {
  const t = today();
  const { data, error, reload } = useApi<Challenge[]>(`/challenges?today=${t}`);
  const { isLeaving, leave } = useLeaving();
  const [burstId, setBurstId] = useState<number | null>(null);
  const [editId, setEditId] = useState<number | null>(null);
  const [title, setTitle] = useState('');
  const [days, setDays] = useState('30');
  const [start, setStart] = useState(t);

  function reset() {
    setEditId(null);
    setTitle('');
    setDays('30');
    setStart(t);
  }

  function startEdit(c: Challenge) {
    setEditId(c.id);
    setTitle(c.title);
    setDays(String(c.targetDays));
    setStart(day(c.startDate));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!title.trim() || !Number(days)) return;
    const body = { title: title.trim(), targetDays: Number(days), startDate: start };
    if (editId) await api(`/challenges/${editId}`, 'PUT', body);
    else await api('/challenges', 'POST', body);
    notify(editId ? 'Challenge updated' : 'Challenge started — you got this 💪');
    reset();
    reload();
  }

  const checkin = async (c: Challenge) => {
    const { checkedIn } = await api<{ checkedIn: boolean }>(`/challenges/${c.id}/checkin`, 'POST', { date: t });
    if (checkedIn) {
      setBurstId(c.id);
      setTimeout(() => setBurstId((id) => (id === c.id ? null : id)), 900);
      notify(`Day ${c.completedDays + 1} done — keep going! 🔥`);
    }
    reload();
  };
  const remove = (c: Challenge) => {
    if (!confirm(`Delete "${c.title}"?`)) return;
    leave(c.id, async () => {
      await api(`/challenges/${c.id}`, 'DELETE');
      notify('Challenge deleted');
      if (editId === c.id) reset();
      reload();
    }).catch(() => { /* failure toast already shown */ });
  };

  return (
    <>
      <h1>Challenges</h1>
      <form className="card row" onSubmit={save}>
        <input style={{ flex: '3 1 200px' }} placeholder="e.g. 30 days no sugar" value={title} onChange={(e) => setTitle(e.target.value)} />
        <input type="number" min="1" style={{ flex: '1 1 80px' }} value={days} onChange={(e) => setDays(e.target.value)} aria-label="Target days" />
        <input type="date" value={start} onChange={(e) => setStart(e.target.value)} />
        <button className="primary">{editId ? 'Save' : 'Start'}</button>
        {editId && <button type="button" onClick={reset}>Cancel</button>}
      </form>

      {error && <div className="error">{error}</div>}
      {data?.length === 0 && <div className="empty"><span className="emoji">🔥</span>No challenges yet — start one above</div>}
      {!data && !error && <span className="skeleton tall" style={{ height: 130 }} />}

      {data?.map((c) => {
        const doneToday = c.checkinDates.some((d) => day(d) === t);
        const pct = Math.min(100, (c.completedDays / c.targetDays) * 100);
        return (
          <div className={`card ${isLeaving(c.id) ? 'leaving-card' : ''}`} key={c.id}>
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <h2 style={{ margin: 0 }}>{c.title}</h2>
              <div>
                <button className="ghost edit" onClick={() => startEdit(c)} aria-label="Edit">✎</button>
                <button className="ghost" onClick={() => remove(c)} aria-label="Delete">✕</button>
              </div>
            </div>
            <div className="muted">
              {c.completedDays}/{c.targetDays} days · 🔥 {c.streak} day streak · started {day(c.startDate)}
            </div>
            <div className="bar"><span style={{ width: `${pct}%` }} /></div>
            <div style={{ marginTop: 12 }}>
              <button className={`relative ${doneToday ? '' : 'primary'}`} onClick={() => checkin(c)}>
                {doneToday ? '✓ Done today (tap to undo)' : 'Check in today'}
                {burstId === c.id && <Burst />}
              </button>
            </div>
          </div>
        );
      })}
    </>
  );
}
