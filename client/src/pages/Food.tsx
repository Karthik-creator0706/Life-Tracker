import { FormEvent, useState } from 'react';
import { api, notify, today, useApi } from '../api';
import { BarChart } from '../components/Charts';
import CountUp from '../components/CountUp';
import { useLeaving } from '../hooks';

type Meal = 'BREAKFAST' | 'LUNCH' | 'DINNER' | 'SNACK';
type Place = 'HOME' | 'OUTSIDE';
interface Food { id: number; date: string; meal: Meal; place: Place; name: string; calories: number | null; note: string | null }
interface Recent { name: string; meal: Meal; place: Place; calories: number | null; count: number }
interface Stats {
  goal: number | null;
  days: { date: string; total: number; calories: number; home: number; outside: number }[];
  month: { total: number; calories: number; home: number; outside: number; snacks: number };
}

const MEALS: { key: Meal; emoji: string; label: string }[] = [
  { key: 'BREAKFAST', emoji: '🌅', label: 'Breakfast' },
  { key: 'LUNCH', emoji: '☀️', label: 'Lunch' },
  { key: 'DINNER', emoji: '🌙', label: 'Dinner' },
  { key: 'SNACK', emoji: '🍿', label: 'Snack' },
];
const PLACES: { key: Place; emoji: string; label: string }[] = [
  { key: 'HOME', emoji: '🏠', label: 'Home' },
  { key: 'OUTSIDE', emoji: '🍴', label: 'Outside' },
];
const placeEmoji = (p: Place) => PLACES.find((x) => x.key === p)!.emoji;

// A sensible starting meal for the time of day; you can always change it.
const guessMeal = (): Meal => {
  const h = new Date().getHours();
  return h < 11 ? 'BREAKFAST' : h < 15 ? 'LUNCH' : h < 18 ? 'SNACK' : 'DINNER';
};

// Calendar days are "YYYY-MM-DD" strings; do the maths in UTC so time zones can't shift them.
const shiftDay = (d: string, n: number) => new Date(Date.parse(d) + n * 86_400_000).toISOString().slice(0, 10);
const fmt = (d: string, opts: Intl.DateTimeFormatOptions) =>
  new Date(`${d}T00:00:00Z`).toLocaleDateString(undefined, { ...opts, timeZone: 'UTC' });

const kcal = (n: number) => Math.round(n).toLocaleString();
const sumKcal = (items: Food[]) => items.reduce((s, f) => s + (f.calories ?? 0), 0);
const compact = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n));

export default function FoodLog() {
  const t = today();
  const [date, setDate] = useState(t);
  const foods = useApi<Food[]>(`/food?date=${date}`);
  const stats = useApi<Stats>(`/food/stats?today=${t}`);
  const recent = useApi<Recent[]>('/food/recent');
  const { isLeaving, leave } = useLeaving();

  const [editId, setEditId] = useState<number | null>(null);
  const [name, setName] = useState('');
  const [meal, setMeal] = useState<Meal>(guessMeal);
  const [place, setPlace] = useState<Place>('HOME');
  const [calories, setCalories] = useState('');
  const [note, setNote] = useState('');

  const [editingGoal, setEditingGoal] = useState(false);
  const [goalInput, setGoalInput] = useState('');

  const dayLabel =
    date === t ? 'Today' : date === shiftDay(t, -1) ? 'Yesterday' : fmt(date, { weekday: 'long', day: 'numeric', month: 'short' });

  const reloadAll = () => { foods.reload(); stats.reload(); recent.reload(); };

  function reset() {
    setEditId(null);
    setName('');
    setNote('');
    setCalories('');
  }

  function startEdit(f: Food) {
    setEditId(f.id);
    setName(f.name);
    setMeal(f.meal);
    setPlace(f.place);
    setCalories(f.calories != null ? String(f.calories) : '');
    setNote(f.note ?? '');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    const body = {
      date,
      meal,
      place,
      name: name.trim(),
      calories: calories.trim() === '' ? null : Math.round(Number(calories)),
      note: note.trim() || null,
    };
    try {
      if (editId) await api(`/food/${editId}`, 'PUT', body);
      else await api('/food', 'POST', body);
    } catch {
      return; // the failure toast is shown by api()
    }
    notify(editId ? 'Meal updated' : `${MEALS.find((m) => m.key === meal)!.emoji} Added to ${dayLabel.toLowerCase()}`);
    reset(); // keep the meal + place: you usually log several things in a row
    reloadAll();
  }

  const remove = (f: Food) =>
    leave(f.id, async () => {
      await api(`/food/${f.id}`, 'DELETE');
      notify('Removed');
      if (editId === f.id) reset();
      reloadAll();
    }).catch(() => { /* failure toast already shown */ });

  async function saveGoal(e: FormEvent) {
    e.preventDefault();
    const n = Math.round(Number(goalInput));
    if (!n) return;
    try {
      await api('/food/goal', 'PUT', { calorieGoal: n });
    } catch {
      return;
    }
    notify(`Daily goal set to ${kcal(n)} kcal`);
    setEditingGoal(false);
    stats.reload();
  }

  async function clearGoal() {
    try {
      await api('/food/goal', 'PUT', { calorieGoal: null });
    } catch {
      return;
    }
    notify('Goal removed');
    setEditingGoal(false);
    stats.reload();
  }

  const list = foods.data ?? [];
  const home = list.filter((f) => f.place === 'HOME').length;
  const outside = list.length - home;
  const snacks = list.filter((f) => f.meal === 'SNACK').length;
  const m = stats.data?.month;

  const goal = stats.data?.goal ?? null;
  const eaten = sumKcal(list);
  const unlogged = list.filter((f) => f.calories == null).length;
  const over = goal != null && eaten > goal;
  const pct = goal ? Math.min(100, (eaten / goal) * 100) : 0;

  const calChart = (stats.data?.days ?? []).map((d) => ({
    label: fmt(d.date, { weekday: 'short' }),
    value: d.calories,
    caption: fmt(d.date, { weekday: 'long', day: 'numeric', month: 'short' }),
  }));
  const hasCalories = calChart.some((d) => d.value > 0);

  return (
    <>
      <h1>Food</h1>

      <div className="month-nav">
        <button type="button" onClick={() => setDate(shiftDay(date, -1))} aria-label="Previous day">‹</button>
        <strong>{dayLabel}</strong>
        <button type="button" onClick={() => setDate(shiftDay(date, 1))} disabled={date >= t} aria-label="Next day">›</button>
      </div>

      <div className="card">
        <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div className="label muted">Calories · {dayLabel.toLowerCase()}</div>
            <div className="cal-big">
              <CountUp value={eaten} format={kcal} />
              <span className="muted"> {goal ? `/ ${kcal(goal)} kcal` : 'kcal'}</span>
            </div>
          </div>
          <button
            type="button"
            className="ghost edit"
            onClick={() => { setGoalInput(goal ? String(goal) : '2000'); setEditingGoal((v) => !v); }}
          >
            {goal ? '✎ Goal' : '+ Set goal'}
          </button>
        </div>

        {goal ? (
          <>
            <div className="bar cal-bar"><span className={over ? 'over' : ''} style={{ width: `${pct}%` }} /></div>
            <div className={over ? 'neg' : 'muted'} style={{ marginTop: 6, fontWeight: over ? 600 : 400 }}>
              {over ? `${kcal(eaten - goal)} kcal over your goal` : `${kcal(goal - eaten)} kcal left today`}
            </div>
          </>
        ) : (
          !editingGoal && <div className="muted" style={{ marginTop: 6 }}>Set a daily goal to see how much you have left.</div>
        )}

        {unlogged > 0 && (
          <div className="muted" style={{ marginTop: 6 }}>
            {unlogged} of {list.length} {list.length === 1 ? 'item has' : 'items have'} no calories, so the total is a minimum.
          </div>
        )}

        {editingGoal && (
          <form className="row" style={{ marginTop: 12 }} onSubmit={saveGoal}>
            <input
              type="number"
              inputMode="numeric"
              min="500"
              max="10000"
              step="50"
              placeholder="Daily goal (kcal)"
              value={goalInput}
              onChange={(e) => setGoalInput(e.target.value)}
              autoFocus
              aria-label="Daily calorie goal"
            />
            <button className="primary">Save goal</button>
            {goal && <button type="button" onClick={clearGoal}>Remove</button>}
            <button type="button" onClick={() => setEditingGoal(false)}>Cancel</button>
          </form>
        )}
      </div>

      <div className="grid g4">
        <div className="card stat"><div className="label">Meals logged</div><div className="value"><CountUp value={list.length} /></div></div>
        <div className="card stat"><div className="label">🏠 At home</div><div className="value"><CountUp value={home} /></div></div>
        <div className="card stat"><div className="label">🍴 Outside</div><div className="value"><CountUp value={outside} /></div></div>
        <div className="card stat"><div className="label">🍿 Snacks</div><div className="value"><CountUp value={snacks} /></div></div>
      </div>

      <form className="card" onSubmit={save}>
        <h2 style={{ marginBottom: 10 }}>{editId ? 'Edit meal' : `What did you eat — ${dayLabel.toLowerCase()}?`}</h2>

        <input
          style={{ width: '100%' }}
          placeholder="e.g. Idli & sambar, samosa, fruit salad"
          maxLength={120}
          value={name}
          onChange={(e) => setName(e.target.value)}
          list="food-recent"
          autoComplete="off"
        />
        <datalist id="food-recent">{recent.data?.map((r) => <option key={r.name} value={r.name} />)}</datalist>

        {!editId && recent.data && recent.data.length > 0 && (
          <div className="chips" aria-label="Your usual foods">
            {recent.data.map((r) => (
              <button
                key={r.name}
                type="button"
                className="chip"
                onClick={() => {
                  setName(r.name);
                  setMeal(r.meal);
                  setPlace(r.place);
                  setCalories(r.calories != null ? String(r.calories) : '');
                }}
                title={`Logged ${r.count}×`}
              >
                {placeEmoji(r.place)} {r.name}{r.calories != null ? ` · ${r.calories}` : ''}
              </button>
            ))}
          </div>
        )}

        <div className="seg meals" role="radiogroup" aria-label="Meal">
          {MEALS.map((x) => (
            <button key={x.key} type="button" role="radio" aria-checked={meal === x.key} className={meal === x.key ? 'on' : ''} onClick={() => setMeal(x.key)}>
              {x.emoji} {x.label}
            </button>
          ))}
        </div>

        <div className="row" style={{ marginTop: 10 }}>
          <div className="seg" role="radiogroup" aria-label="Where">
            {PLACES.map((x) => (
              <button key={x.key} type="button" role="radio" aria-checked={place === x.key} className={place === x.key ? 'on' : ''} onClick={() => setPlace(x.key)}>
                {x.emoji} {x.label}
              </button>
            ))}
          </div>
          <input
            style={{ flex: '1 1 130px' }}
            type="number"
            inputMode="numeric"
            min="0"
            max="10000"
            placeholder="Calories (kcal)"
            value={calories}
            onChange={(e) => setCalories(e.target.value)}
          />
          <input style={{ flex: '2 1 160px' }} placeholder="Note (optional)" maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} />
        </div>

        <div className="row" style={{ marginTop: 12 }}>
          <button className="primary">{editId ? 'Save changes' : 'Add'}</button>
          {editId && <button type="button" onClick={reset}>Cancel</button>}
        </div>
      </form>

      <div className="card">
        <h2>{dayLabel}'s food</h2>
        {foods.error && <div className="error">{foods.error}</div>}
        {foods.loading && !foods.data && [0, 1, 2].map((i) => (
          <div className="skeleton-row" key={i}><span className="skeleton" style={{ flex: 1 }} /><span className="skeleton" style={{ width: 60 }} /></div>
        ))}
        {foods.data && list.length === 0 && (
          <div className="empty"><span className="emoji">🍽️</span>Nothing logged for {dayLabel.toLowerCase()} yet</div>
        )}

        {MEALS.map((mt) => {
          const items = list.filter((f) => f.meal === mt.key);
          if (!items.length) return null;
          const subtotal = sumKcal(items);
          return (
            <div key={mt.key} className="meal-group">
              <div className="meal-title">
                <span>{mt.emoji} {mt.label}</span>
                {subtotal > 0 && <span>{kcal(subtotal)} kcal</span>}
              </div>
              <ul className="list">
                {items.map((f) => (
                  <li key={f.id} className={isLeaving(f.id) ? 'leaving' : ''}>
                    <div className="grow">
                      <div className="title">{f.name}</div>
                      {f.note && <div className="muted">{f.note}</div>}
                    </div>
                    {f.calories != null && <span className="kcal">{kcal(f.calories)} kcal</span>}
                    <span className={`badge place-${f.place.toLowerCase()}`}>{placeEmoji(f.place)} {f.place === 'HOME' ? 'Home' : 'Outside'}</span>
                    <button className="ghost edit" onClick={() => startEdit(f)} aria-label="Edit">✎</button>
                    <button className="ghost" onClick={() => remove(f)} aria-label="Delete">✕</button>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>

      {hasCalories && (
        <div className="card">
          <h2>Calories · last 7 days</h2>
          <BarChart
            data={calChart}
            format={(n) => `${kcal(n)} kcal`}
            label="Calories eaten per day"
            reference={goal ? { value: goal, label: `Goal ${kcal(goal)}` } : undefined}
          />
        </div>
      )}

      <div className="card">
        <h2>Last 7 days</h2>
        <div className="week">
          {(stats.data?.days ?? []).map((d) => (
            <button
              key={d.date}
              type="button"
              className={`week-day ${d.date === date ? 'on' : ''}`}
              onClick={() => setDate(d.date)}
              aria-label={`${fmt(d.date, { weekday: 'long', day: 'numeric', month: 'short' })}: ${d.total} logged, ${d.home} home, ${d.outside} outside${d.calories ? `, ${d.calories} kcal` : ''}`}
            >
              <span className="wd">{fmt(d.date, { weekday: 'short' })}</span>
              <span className="wn">{d.total}</span>
              <span className="split">
                {d.home > 0 && <i className="home" style={{ flex: d.home }} />}
                {d.outside > 0 && <i className="outside" style={{ flex: d.outside }} />}
              </span>
              <span className="wk">{d.calories > 0 ? compact(d.calories) : ' '}</span>
            </button>
          ))}
        </div>
        <div className="legend muted">
          <span><i className="swatch home" /> 🏠 Home</span>
          <span><i className="swatch outside" /> 🍴 Outside</span>
          <span>small number = kcal</span>
        </div>
        {m && m.total > 0 && (
          <div className="muted" style={{ marginTop: 10 }}>
            This month: <strong>{m.total}</strong> logged · 🏠 {m.home} home · 🍴 {m.outside} outside · 🍿 {m.snacks} snacks
            {m.calories > 0 && <> · {kcal(m.calories)} kcal total</>}
          </div>
        )}
      </div>
    </>
  );
}
