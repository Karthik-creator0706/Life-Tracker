import { FormEvent, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api, day, notify, today, useApi } from '../api';
import { useLeaving } from '../hooks';
import { LineChart } from '../components/Charts';

interface Exercise { id?: number; name: string; sets: number; reps: number; weightKg: number | null }
interface Workout { id: number; date: string; title: string; durationMin: number | null; exercises: Exercise[] }
interface Run { id: number; date: string; rounds: number; durationMin: number }
interface Metric { id: number; date: string; weightKg: number }

type Tab = 'gym' | 'run' | 'body';

const roundsLabel = (n: number) => `${n} ${n === 1 ? 'round' : 'rounds'}`;

const pace = (r: Run) => {
  const p = r.durationMin / r.rounds;
  const m = Math.floor(p);
  return `${m}:${String(Math.round((p - m) * 60)).padStart(2, '0')} /round`;
};

const scrollTop = () => window.scrollTo({ top: 0, behavior: 'smooth' });

export default function Fitness() {
  const [params] = useSearchParams();
  const wanted = params.get('tab');
  const [tab, setTab] = useState<Tab>(wanted === 'run' || wanted === 'body' ? wanted : 'gym');
  return (
    <>
      <h1>Body</h1>
      <div className="tabs">
        <button className={tab === 'gym' ? 'on' : ''} onClick={() => setTab('gym')}>Gym</button>
        <button className={tab === 'run' ? 'on' : ''} onClick={() => setTab('run')}>Running</button>
        <button className={tab === 'body' ? 'on' : ''} onClick={() => setTab('body')}>Weight</button>
      </div>
      {tab === 'gym' && <Gym />}
      {tab === 'run' && <Running />}
      {tab === 'body' && <BodyWeight />}
    </>
  );
}

type ExRow = { name: string; sets: string; reps: string; weightKg: string };
const blankEx = (): ExRow => ({ name: '', sets: '3', reps: '10', weightKg: '' });

function Gym() {
  const { data, reload } = useApi<Workout[]>('/fitness/workouts');
  const { isLeaving, leave } = useLeaving();
  const [editId, setEditId] = useState<number | null>(null);
  const [date, setDate] = useState(today());
  const [title, setTitle] = useState('');
  const [duration, setDuration] = useState('');
  const [exercises, setExercises] = useState<ExRow[]>([blankEx()]);

  const setEx = (i: number, patch: Partial<ExRow>) =>
    setExercises((xs) => xs.map((x, j) => (j === i ? { ...x, ...patch } : x)));

  function reset() {
    setEditId(null);
    setTitle('');
    setDuration('');
    setExercises([blankEx()]);
  }

  function startEdit(w: Workout) {
    setEditId(w.id);
    setDate(day(w.date));
    setTitle(w.title);
    setDuration(w.durationMin ? String(w.durationMin) : '');
    setExercises(
      w.exercises.length
        ? w.exercises.map((x) => ({ name: x.name, sets: String(x.sets), reps: String(x.reps), weightKg: x.weightKg ? String(x.weightKg) : '' }))
        : [blankEx()],
    );
    scrollTop();
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    const body = {
      date,
      title: title.trim(),
      durationMin: duration ? Number(duration) : null,
      exercises: exercises
        .filter((x) => x.name.trim())
        .map((x) => ({ name: x.name.trim(), sets: Number(x.sets) || 1, reps: Number(x.reps) || 1, weightKg: x.weightKg ? Number(x.weightKg) : null })),
    };
    if (editId) await api(`/fitness/workouts/${editId}`, 'PUT', body);
    else await api('/fitness/workouts', 'POST', body);
    notify(editId ? 'Workout updated' : 'Workout saved 💪');
    reset();
    reload();
  }

  return (
    <>
      <form className="card" onSubmit={save}>
        <div className="row" style={{ marginBottom: 10 }}>
          <input style={{ flex: '2 1 160px' }} placeholder="Workout (e.g. Push day)" value={title} onChange={(e) => setTitle(e.target.value)} />
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          <input type="number" min="1" placeholder="Minutes" style={{ flex: '1 1 90px' }} value={duration} onChange={(e) => setDuration(e.target.value)} />
        </div>
        {exercises.map((x, i) => (
          <div className="ex-row" key={i}>
            <input placeholder="Exercise" value={x.name} onChange={(e) => setEx(i, { name: e.target.value })} />
            <input type="number" min="1" placeholder="Sets" value={x.sets} onChange={(e) => setEx(i, { sets: e.target.value })} />
            <input type="number" min="1" placeholder="Reps" value={x.reps} onChange={(e) => setEx(i, { reps: e.target.value })} />
            <input type="number" min="0" step="0.5" placeholder="kg" value={x.weightKg} onChange={(e) => setEx(i, { weightKg: e.target.value })} />
            <button type="button" className="ghost" onClick={() => setExercises((xs) => xs.filter((_, j) => j !== i))} aria-label="Remove exercise">✕</button>
          </div>
        ))}
        <div className="row" style={{ marginTop: 8 }}>
          <button type="button" onClick={() => setExercises((xs) => [...xs, blankEx()])}>+ Exercise</button>
          <button className="primary">{editId ? 'Save changes' : 'Save workout'}</button>
          {editId && <button type="button" onClick={reset}>Cancel</button>}
        </div>
      </form>

      <div className="card">
        <h2>History</h2>
        {data?.length === 0 && <div className="empty"><span className="emoji">🏋️</span>No workouts logged yet</div>}
        <ul className="list">
          {data?.map((w) => (
            <li key={w.id} className={isLeaving(w.id) ? 'leaving' : ''} style={{ alignItems: 'flex-start' }}>
              <div className="grow">
                <div className="title"><strong>{w.title}</strong> <span className="muted">· {day(w.date)}{w.durationMin ? ` · ${w.durationMin} min` : ''}</span></div>
                {w.exercises.map((x) => (
                  <div className="muted" key={x.id}>{x.name} — {x.sets}×{x.reps}{x.weightKg ? ` @ ${x.weightKg}kg` : ''}</div>
                ))}
              </div>
              <button className="ghost edit" onClick={() => startEdit(w)} aria-label="Edit">✎</button>
              <button className="ghost" onClick={() => leave(w.id, async () => { await api(`/fitness/workouts/${w.id}`, 'DELETE'); notify('Workout deleted'); if (editId === w.id) reset(); reload(); }).catch(() => {})} aria-label="Delete">✕</button>
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}

function Running() {
  const { data, reload } = useApi<Run[]>('/fitness/runs');
  const { isLeaving, leave } = useLeaving();
  const [editId, setEditId] = useState<number | null>(null);
  const [date, setDate] = useState(today());
  const [rounds, setRounds] = useState('');
  const [min, setMin] = useState('');

  function reset() {
    setEditId(null);
    setRounds('');
    setMin('');
  }

  function startEdit(r: Run) {
    setEditId(r.id);
    setDate(day(r.date));
    setRounds(String(r.rounds));
    setMin(String(r.durationMin));
    scrollTop();
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!Number(rounds) || !Number(min)) return;
    const body = { date, rounds: Number(rounds), durationMin: Number(min) };
    if (editId) await api(`/fitness/runs/${editId}`, 'PUT', body);
    else await api('/fitness/runs', 'POST', body);
    notify(editId ? 'Rounds updated' : 'Rounds logged 🏃');
    reset();
    reload();
  }

  return (
    <>
      <form className="card row" onSubmit={save}>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        <input type="number" inputMode="decimal" step="any" min="0" placeholder="Rounds" value={rounds} onChange={(e) => setRounds(e.target.value)} />
        <input type="number" inputMode="decimal" step="0.1" min="0" placeholder="Time (min)" value={min} onChange={(e) => setMin(e.target.value)} />
        <button className="primary">{editId ? 'Save' : 'Add rounds'}</button>
        {editId && <button type="button" onClick={reset}>Cancel</button>}
      </form>
      <div className="card">
        <h2>Rounds</h2>
        {data?.length === 0 && <div className="empty"><span className="emoji">🏃</span>No rounds yet — go get some</div>}
        <ul className="list">
          {data?.map((r) => (
            <li key={r.id} className={isLeaving(r.id) ? 'leaving' : ''}>
              <div className="grow">
                <div className="title"><strong>{roundsLabel(r.rounds)}</strong> <span className="muted">in {r.durationMin} min · {pace(r)}</span></div>
                <div className="muted">{day(r.date)}</div>
              </div>
              <button className="ghost edit" onClick={() => startEdit(r)} aria-label="Edit">✎</button>
              <button className="ghost" onClick={() => leave(r.id, async () => { await api(`/fitness/runs/${r.id}`, 'DELETE'); notify('Rounds deleted'); if (editId === r.id) reset(); reload(); }).catch(() => {})} aria-label="Delete">✕</button>
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}

function BodyWeight() {
  const { data, reload } = useApi<Metric[]>('/fitness/body');
  const { isLeaving, leave } = useLeaving();
  const [editId, setEditId] = useState<number | null>(null);
  const [date, setDate] = useState(today());
  const [kg, setKg] = useState('');

  function reset() {
    setEditId(null);
    setKg('');
  }

  function startEdit(m: Metric) {
    setEditId(m.id);
    setDate(day(m.date));
    setKg(String(m.weightKg));
    scrollTop();
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!Number(kg)) return;
    const body = { date, weightKg: Number(kg) };
    if (editId) await api(`/fitness/body/${editId}`, 'PUT', body);
    else await api('/fitness/body', 'POST', body);
    notify(editId ? 'Weight updated' : 'Weight logged');
    reset();
    reload();
  }

  // Server returns newest first; the chart wants oldest -> newest.
  const series = [...(data ?? [])].reverse().map((m) => ({ date: day(m.date), value: m.weightKg }));

  return (
    <>
      <form className="card row" onSubmit={save}>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        <input type="number" inputMode="decimal" step="0.1" min="0" placeholder="Weight (kg)" value={kg} onChange={(e) => setKg(e.target.value)} />
        <button className="primary">{editId ? 'Save' : 'Log weight'}</button>
        {editId && <button type="button" onClick={reset}>Cancel</button>}
      </form>

      {series.length > 0 && (
        <div className="card">
          <h2>Weight trend (kg)</h2>
          <LineChart data={series} format={(n) => `${n.toFixed(1)} kg`} label="Body weight" />
        </div>
      )}

      <div className="card">
        <h2>Weight log</h2>
        {data?.length === 0 && <div className="empty"><span className="emoji">⚖️</span>No entries yet</div>}
        <ul className="list">
          {data?.map((m, i) => {
            const prev = data[i + 1];
            const diff = prev ? m.weightKg - prev.weightKg : 0;
            return (
              <li key={m.id} className={isLeaving(m.id) ? 'leaving' : ''}>
                <div className="grow"><strong>{m.weightKg} kg</strong> <span className="muted">· {day(m.date)}</span></div>
                {prev && diff !== 0 && <span className={diff < 0 ? 'pos' : 'neg'}>{diff > 0 ? '+' : ''}{diff.toFixed(1)}</span>}
                <button className="ghost edit" onClick={() => startEdit(m)} aria-label="Edit">✎</button>
                <button className="ghost" onClick={() => leave(m.id, async () => { await api(`/fitness/body/${m.id}`, 'DELETE'); notify('Entry deleted'); if (editId === m.id) reset(); reload(); }).catch(() => {})} aria-label="Delete">✕</button>
              </li>
            );
          })}
        </ul>
      </div>
    </>
  );
}
