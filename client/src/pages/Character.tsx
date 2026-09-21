import { FormEvent, useEffect, useRef, useState } from 'react';
import { api, notify, today, useApi } from '../api';
import Burst from '../components/Burst';
import { BarChart, HBars } from '../components/Charts';
import CountUp from '../components/CountUp';
import { shiftDay } from '../careerLogic';
import {
  daysToNextLevel, EMOJI_CHOICES, levelInfo, levelsUpWithOneMoreDay, overallXp, RATING_FACES, RATING_LABELS, suggestionsLeft, traitXp,
} from '../characterLogic';
import { useLeaving } from '../hooks';

interface TraitStat {
  id: number;
  name: string;
  emoji: string;
  why: string | null;
  days: number;
  last30: number;
  streak: number;
  practicedToday: boolean;
  todayNote: string | null;
}
interface Overview {
  traits: TraitStat[];
  totals: { checkins: number; reflections: number; streak: number; bestStreak: number; practicedToday: number; reflectedToday: boolean };
  days14: { date: string; count: number }[];
  averageRating14: number | null;
  recentWins: { date: string; wins: string; rating: number | null }[];
}
interface DayData {
  checkins: { traitId: number; note: string | null }[];
  reflection: { wins: string | null; improve: string | null; rating: number | null } | null;
}

const fmtDay = (d: string, o: Intl.DateTimeFormatOptions) => new Date(`${d}T00:00:00Z`).toLocaleDateString(undefined, { ...o, timeZone: 'UTC' });

export default function Character() {
  const t = today();
  const [date, setDate] = useState(t);
  const overview = useApi<Overview>(`/character/overview?today=${t}`);
  const day = useApi<DayData>(`/character/day?date=${date}`);
  const { isLeaving, leave } = useLeaving();

  // notes typed for ticked qualities, and the day's reflection
  const [notes, setNotes] = useState<Record<number, string>>({});
  const [wins, setWins] = useState('');
  const [improve, setImprove] = useState('');
  const [rating, setRating] = useState<number | null>(null);
  const syncedFor = useRef<string | null>(null);

  // quality form
  const [editId, setEditId] = useState<number | null>(null);
  const [name, setName] = useState('');
  const [emoji, setEmoji] = useState('⭐');
  const [why, setWhy] = useState('');
  const [burst, setBurst] = useState(false);

  // Fill the notes and reflection from the server once per day you look at (so typing is never overwritten).
  useEffect(() => {
    if (!day.data || syncedFor.current === date) return;
    syncedFor.current = date;
    setNotes(Object.fromEntries(day.data.checkins.map((c) => [c.traitId, c.note ?? ''])));
    setWins(day.data.reflection?.wins ?? '');
    setImprove(day.data.reflection?.improve ?? '');
    setRating(day.data.reflection?.rating ?? null);
  }, [day.data, date]);

  const reloadAll = () => { overview.reload(); day.reload(); };
  const ov = overview.data;
  const traits = ov?.traits ?? [];
  const ticked = new Map((day.data?.checkins ?? []).map((c) => [c.traitId, c.note]));
  const dayLabel = date === t ? 'Today' : date === shiftDay(t, -1) ? 'Yesterday' : fmtDay(date, { weekday: 'long', day: 'numeric', month: 'short' });

  const xp = ov ? overallXp(ov.totals.checkins, ov.totals.reflections) : 0;
  const lvl = levelInfo(xp);

  // ---------------------------------------------------------------- practising
  async function toggle(tr: TraitStat) {
    const turningOn = !ticked.has(tr.id);
    try {
      await api('/character/checkin', 'PUT', { traitId: tr.id, date, done: turningOn, note: turningOn ? notes[tr.id] || null : null });
    } catch {
      return; // failure toast shown by api()
    }
    if (!turningOn) setNotes((n) => ({ ...n, [tr.id]: '' }));
    if (turningOn) {
      const before = ticked.size;
      if (levelsUpWithOneMoreDay(tr.days)) {
        const next = levelInfo(traitXp(tr.days + 1));
        notify(`🎉 ${tr.name} reached level ${next.level} — ${next.title}!`);
      } else {
        notify(`${tr.emoji} ${tr.name} practised`);
      }
      if (traits.length > 0 && before + 1 === traits.length) {
        setBurst(true);
        setTimeout(() => setBurst(false), 900);
        notify(`Every quality practised — ${dayLabel.toLowerCase()} ✨`);
      }
    }
    reloadAll();
  }

  async function saveNote(tr: TraitStat) {
    if (!ticked.has(tr.id)) return;
    const value = (notes[tr.id] ?? '').trim();
    if (value === (ticked.get(tr.id) ?? '')) return; // nothing changed
    try {
      await api('/character/checkin', 'PUT', { traitId: tr.id, date, done: true, note: value || null });
      day.reload();
    } catch { /* toast shown */ }
  }

  async function saveReflection(e: FormEvent) {
    e.preventDefault();
    try {
      await api('/character/reflection/' + date, 'PUT', { wins: wins.trim() || null, improve: improve.trim() || null, rating });
    } catch {
      return;
    }
    notify(wins.trim() || improve.trim() || rating ? 'Reflection saved 🌟' : 'Reflection cleared');
    reloadAll();
  }

  // ------------------------------------------------------------- managing qualities
  function resetForm() {
    setEditId(null);
    setName('');
    setEmoji('⭐');
    setWhy('');
  }

  function startEdit(tr: TraitStat) {
    setEditId(tr.id);
    setName(tr.name);
    setEmoji(tr.emoji);
    setWhy(tr.why ?? '');
    document.getElementById('my-qualities')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  async function saveTrait(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    const body = { name: name.trim(), emoji: emoji.trim() || '⭐', why: why.trim() || null };
    try {
      if (editId) await api(`/character/traits/${editId}`, 'PUT', body);
      else await api('/character/traits', 'POST', body);
    } catch {
      return;
    }
    notify(editId ? 'Quality updated' : `${body.emoji} ${body.name} added — start with today`);
    resetForm();
    reloadAll();
  }

  const removeTrait = (tr: TraitStat) => {
    if (!confirm(`Delete "${tr.name}"${tr.days ? ` and its ${tr.days} practice day${tr.days === 1 ? '' : 's'}` : ''}?`)) return;
    leave(tr.id, async () => {
      await api(`/character/traits/${tr.id}`, 'DELETE');
      notify('Quality deleted');
      if (editId === tr.id) resetForm();
      reloadAll();
    }).catch(() => { /* toast already shown */ });
  };

  const ideas = suggestionsLeft(traits.map((x) => x.name));

  return (
    <>
      <h1>Character</h1>

      {/* character sheet */}
      <div className="card sheet">
        <div className="sheet-top">
          <div className="sheet-level" aria-label={`Level ${lvl.level}`}><span>LV</span><strong><CountUp value={lvl.level} /></strong></div>
          <div className="sheet-who">
            <div className="sheet-title">{lvl.title}</div>
            <div className="muted">{xp.toLocaleString()} XP · {lvl.toNext.toLocaleString()} to level {lvl.level + 1}</div>
          </div>
        </div>
        <div className="bar cal-bar"><span style={{ width: `${lvl.pct}%` }} /></div>
        <div className="sheet-stats">
          <div><span>Days practised</span><strong>{ov?.totals.checkins ?? 0}</strong></div>
          <div><span>🔥 Streak</span><strong>{ov?.totals.streak ?? 0}</strong></div>
          <div><span>Best streak</span><strong>{ov?.totals.bestStreak ?? 0}</strong></div>
          <div><span>Reflections</span><strong>{ov?.totals.reflections ?? 0}</strong></div>
          <div><span>Avg. day (14d)</span><strong>{ov?.averageRating14 != null ? `${RATING_FACES[Math.round(ov.averageRating14) - 1]} ${ov.averageRating14}` : '–'}</strong></div>
        </div>
      </div>

      {/* practising */}
      <div className="month-nav">
        <button type="button" onClick={() => { setDate(shiftDay(date, -1)); }} aria-label="Previous day">‹</button>
        <strong>{dayLabel}</strong>
        <button type="button" onClick={() => setDate(shiftDay(date, 1))} disabled={date >= t} aria-label="Next day">›</button>
      </div>

      <div className="card relative">
        <div className="insight-head">
          <h2 style={{ margin: 0 }}>{date === t ? "Today's practice" : `${dayLabel}'s practice`}</h2>
          {traits.length > 0 && <span className="muted">{ticked.size} of {traits.length} practised</span>}
        </div>

        {overview.loading && !ov && [0, 1, 2].map((i) => <div className="skeleton-row" key={i}><span className="skeleton" style={{ width: 40, height: 40, borderRadius: 20 }} /><span className="skeleton" style={{ flex: 1 }} /></div>)}
        {ov && traits.length === 0 && (
          <div className="empty"><span className="emoji">🌟</span>Pick the good qualities you want to grow — add your first one below</div>
        )}

        <ul className="list trait-list">
          {traits.map((tr) => {
            const on = ticked.has(tr.id);
            const info = levelInfo(traitXp(tr.days));
            return (
              <li key={tr.id} className={`trait-row ${on ? 'on' : ''} ${isLeaving(tr.id) ? 'leaving' : ''}`}>
                <button type="button" className={`check-btn ${on ? 'on' : ''}`} onClick={() => toggle(tr)} aria-pressed={on} aria-label={`${on ? 'Undo' : 'Mark'} ${tr.name} for ${dayLabel.toLowerCase()}`}>
                  {on ? '✓' : tr.emoji}
                </button>
                <div className="grow">
                  <div className="title">
                    <strong>{tr.name}</strong>
                    <span className="level-chip">Lv {info.level} · {info.title}</span>
                    {tr.streak > 1 && <span className="streak-chip">🔥 {tr.streak}</span>}
                  </div>
                  {tr.why && !on && <div className="muted">{tr.why}</div>}
                  {on && (
                    <input
                      className="note-input"
                      placeholder="What did you do? (optional)"
                      maxLength={500}
                      value={notes[tr.id] ?? ''}
                      onChange={(e) => setNotes((n) => ({ ...n, [tr.id]: e.target.value }))}
                      onBlur={() => saveNote(tr)}
                      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); (e.target as HTMLInputElement).blur(); } }}
                    />
                  )}
                </div>
              </li>
            );
          })}
        </ul>
        {burst && <Burst />}
      </div>

      {/* daily reflection */}
      <form className="card" onSubmit={saveReflection}>
        <h2 style={{ marginBottom: 10 }}>{date === t ? "Today's reflection" : `${dayLabel}'s reflection`}</h2>
        <label className="profile-field" style={{ marginTop: 0 }}>
          <span>🌟 Good things I did</span>
          <textarea rows={3} maxLength={2000} placeholder="What did I do well today? Who did I help? What am I proud of?" value={wins} onChange={(e) => setWins(e.target.value)} style={{ lineHeight: 1.6 }} />
        </label>
        <label className="profile-field">
          <span>🌱 One thing to do better tomorrow</span>
          <input maxLength={1000} placeholder="e.g. Pause before I react" value={improve} onChange={(e) => setImprove(e.target.value)} />
        </label>
        <div className="profile-field">
          <span>How well did I live up to my best self?</span>
          <div className="faces" role="radiogroup" aria-label="Day rating">
            {RATING_FACES.map((f, i) => (
              <button key={f} type="button" role="radio" aria-checked={rating === i + 1} className={`face ${rating === i + 1 ? 'on' : ''}`} onClick={() => setRating(rating === i + 1 ? null : i + 1)} title={RATING_LABELS[i]}>{f}</button>
            ))}
            {rating && <span className="muted">{RATING_LABELS[rating - 1]}</span>}
          </div>
        </div>
        <div className="row" style={{ marginTop: 14 }}>
          <button className="primary">Save reflection</button>
          <span className="muted">+5 XP for reflecting</span>
        </div>
      </form>

      {/* my qualities */}
      <div className="card" id="my-qualities">
        <h2 style={{ marginBottom: 10 }}>{editId ? 'Edit quality' : 'My qualities'}</h2>

        {!editId && traits.length > 0 && (
          <ul className="list">
            {traits.map((tr) => {
              const info = levelInfo(traitXp(tr.days));
              return (
                <li key={tr.id} className={isLeaving(tr.id) ? 'leaving' : ''} style={{ alignItems: 'flex-start' }}>
                  <span className="trait-emoji" aria-hidden>{tr.emoji}</span>
                  <div className="grow">
                    <div className="title"><strong>{tr.name}</strong> <span className="level-chip">Lv {info.level} · {info.title}</span></div>
                    <div className="bar" style={{ marginTop: 6 }}><span style={{ width: `${info.pct}%` }} /></div>
                    <div className="muted" style={{ marginTop: 4 }}>
                      {tr.days} {tr.days === 1 ? 'day' : 'days'} practised · {daysToNextLevel(tr.days)} to level {info.level + 1} · {tr.last30} in the last 30 days
                    </div>
                  </div>
                  <button className="ghost edit" onClick={() => startEdit(tr)} aria-label={`Edit ${tr.name}`}>✎</button>
                  <button className="ghost" onClick={() => removeTrait(tr)} aria-label={`Delete ${tr.name}`}>✕</button>
                </li>
              );
            })}
          </ul>
        )}

        <form onSubmit={saveTrait} style={{ marginTop: traits.length && !editId ? 16 : 0 }}>
          {!editId && <div className="insight-sub" style={{ marginTop: 0 }}>Add a quality</div>}
          <div className="row">
            <input style={{ flex: '0 0 76px', textAlign: 'center', fontSize: '1.4rem' }} value={emoji} maxLength={16} onChange={(e) => setEmoji(e.target.value)} aria-label="Emoji" />
            <input style={{ flex: '2 1 180px' }} placeholder="e.g. Patience" maxLength={60} value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="chips" aria-label="Pick an emoji">
            {EMOJI_CHOICES.map((e) => <button key={e} type="button" className={`chip ${emoji === e ? 'on' : ''}`} onClick={() => setEmoji(e)}>{e}</button>)}
          </div>
          <input style={{ width: '100%', marginTop: 10 }} placeholder="What does it look like for me? (optional)" maxLength={500} value={why} onChange={(e) => setWhy(e.target.value)} />
          <div className="row" style={{ marginTop: 12 }}>
            <button className="primary">{editId ? 'Save changes' : 'Add quality'}</button>
            {editId && <button type="button" onClick={resetForm}>Cancel</button>}
          </div>
        </form>

        {!editId && ideas.length > 0 && (
          <>
            <div className="insight-sub">Ideas to start with</div>
            <div className="chips">
              {ideas.map((s) => (
                <button key={s.name} type="button" className="chip" title={s.why} onClick={() => { setName(s.name); setEmoji(s.emoji); setWhy(s.why); }}>{s.emoji} {s.name}</button>
              ))}
            </div>
          </>
        )}
      </div>

      {/* progress */}
      {ov && ov.days14.some((d) => d.count > 0) && (
        <div className="card">
          <div className="insight-head"><h2 style={{ margin: 0 }}>Practice this fortnight</h2><span className="muted">qualities practised per day</span></div>
          <BarChart
            height={170}
            label="Qualities practised per day"
            format={(n) => `${n} ${n === 1 ? 'quality' : 'qualities'}`}
            reference={traits.length > 1 ? { value: traits.length, label: 'All' } : undefined}
            data={ov.days14.map((d) => ({ label: String(Number(d.date.slice(8, 10))), value: d.count, caption: fmtDay(d.date, { weekday: 'long', day: 'numeric', month: 'short' }) }))}
          />
        </div>
      )}
      {ov && traits.some((x) => x.last30 > 0) && (
        <div className="card">
          <div className="insight-head"><h2 style={{ margin: 0 }}>Where I've been working</h2><span className="muted">days practised, last 30 days</span></div>
          <HBars items={[...traits].sort((a, b) => b.last30 - a.last30).map((x) => ({ label: `${x.emoji} ${x.name}`, value: x.last30 }))} format={(n) => `${n} ${n === 1 ? 'day' : 'days'}`} />
        </div>
      )}
      {ov && ov.recentWins.length > 0 && (
        <div className="card">
          <h2>Recent wins</h2>
          <ul className="list">
            {ov.recentWins.map((w) => (
              <li key={w.date} style={{ alignItems: 'flex-start' }}>
                <div className="entry-date" style={{ width: 54 }}>
                  <span className="dow">{fmtDay(w.date, { weekday: 'short' })}</span>
                  <span className="dom">{fmtDay(w.date, { day: 'numeric' })}</span>
                  <span className="mon">{fmtDay(w.date, { month: 'short' })}</span>
                </div>
                <div className="grow"><div className="study-notes">{w.wins}</div></div>
                {w.rating && <span title={RATING_LABELS[w.rating - 1]} style={{ fontSize: '1.3rem' }}>{RATING_FACES[w.rating - 1]}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}
