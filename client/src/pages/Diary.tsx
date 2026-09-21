import { FormEvent, KeyboardEvent, ReactNode, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { api, day, notify, thisMonth, today, useApi } from '../api';
import Burst from '../components/Burst';
import CountUp from '../components/CountUp';
import { useDebounced, useLeaving } from '../hooks';

type Mood = 'GREAT' | 'GOOD' | 'OKAY' | 'LOW' | 'BAD';
interface Entry { id: number; date: string; title: string | null; content: string; mood: Mood | null }
interface Stats { total: number; thisMonth: number; streak: number; wroteToday: boolean }

const MOODS: { key: Mood; emoji: string; label: string }[] = [
  { key: 'GREAT', emoji: '😄', label: 'Great' },
  { key: 'GOOD', emoji: '🙂', label: 'Good' },
  { key: 'OKAY', emoji: '😐', label: 'Okay' },
  { key: 'LOW', emoji: '😔', label: 'Low' },
  { key: 'BAD', emoji: '😢', label: 'Bad' },
];
const emojiOf = (m: Mood | null) => MOODS.find((x) => x.key === m)?.emoji;

const PROMPTS = [
  'What made today worth remembering?',
  'What are you grateful for right now?',
  'What did you learn today?',
  'What is on your mind?',
  'What would make tomorrow great?',
  'Who or what made you smile today?',
];

// All dates are calendar days stored as UTC midnight, so format them in UTC too.
const fmt = (d: string, opts: Intl.DateTimeFormatOptions) =>
  new Date(`${d}T00:00:00Z`).toLocaleDateString(undefined, { ...opts, timeZone: 'UTC' });
const longDate = (d: string) => fmt(d, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
const monthLabel = (m: string) => fmt(`${m}-01`, { month: 'long', year: 'numeric' });
const shiftMonth = (m: string, delta: number) => {
  const [y, mo] = m.split('-').map(Number);
  return new Date(Date.UTC(y, mo - 1 + delta, 1)).toISOString().slice(0, 7);
};

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Wraps search matches in <mark>. Plain string splitting, so entry text is never treated as HTML. */
function Highlight({ text, q }: { text: string; q: string }): ReactNode {
  if (!q) return text;
  return text
    .split(new RegExp(`(${escapeRegExp(q)})`, 'ig'))
    .map((part, i) => (part.toLowerCase() === q.toLowerCase() ? <mark key={i}>{part}</mark> : part));
}

export default function Diary() {
  const t = today();
  const [month, setMonth] = useState(thisMonth());
  const [search, setSearch] = useState('');
  const q = useDebounced(search.trim(), 300);

  const entries = useApi<Entry[]>(q ? `/diary?q=${encodeURIComponent(q)}` : `/diary?month=${month}`);
  const stats = useApi<Stats>(`/diary/stats?today=${t}`);

  // The page being written
  const [date, setDate] = useState(t);
  const [mood, setMood] = useState<Mood | null>(null);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [existing, setExisting] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [burst, setBurst] = useState(false);
  const [openId, setOpenId] = useState<number | null>(null);
  const { isLeaving, leave } = useLeaving();
  const area = useRef<HTMLTextAreaElement>(null);

  // Load whatever is already written for the chosen day.
  useEffect(() => {
    let cancelled = false;
    api<{ entry: Entry | null }>(`/diary/${date}`)
      .then(({ entry }) => {
        if (cancelled) return;
        setMood(entry?.mood ?? null);
        setTitle(entry?.title ?? '');
        setContent(entry?.content ?? '');
        setExisting(!!entry);
        setDirty(false);
      })
      .catch(() => { /* the list below shows connection problems */ });
    return () => { cancelled = true; };
  }, [date]);

  // Grow the writing area with its content.
  useLayoutEffect(() => {
    const el = area.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.max(200, el.scrollHeight)}px`;
  }, [content]);

  function switchDate(next: string) {
    if (!next || next === date) return;
    if (dirty && !confirm('Discard your unsaved changes?')) return;
    setDate(next);
  }

  const touch = <T,>(set: (v: T) => void) => (v: T) => { set(v); setDirty(true); };

  async function save(e?: FormEvent) {
    e?.preventDefault();
    if (!content.trim()) { notify('Write something first', 'error'); return; }
    setSaving(true);
    try {
      await api(`/diary/${date}`, 'PUT', { title: title.trim() || null, content, mood });
      const first = !existing;
      setExisting(true);
      setDirty(false);
      notify(first ? 'Entry saved ✨' : 'Entry updated');
      if (first) { setBurst(true); setTimeout(() => setBurst(false), 900); }
      entries.reload();
      stats.reload();
    } catch {
      /* the failure toast is shown by api() */
    } finally {
      setSaving(false);
    }
  }

  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); save(); }
  };

  function remove(en: Entry) {
    const d = day(en.date);
    if (!confirm(`Delete your entry for ${longDate(d)}? This can't be undone.`)) return;
    leave(en.id, async () => {
      await api(`/diary/${d}`, 'DELETE');
      notify('Entry deleted');
      if (d === date) { setContent(''); setTitle(''); setMood(null); setExisting(false); setDirty(false); }
      entries.reload();
      stats.reload();
    }).catch(() => { /* toast already shown */ });
  }

  function edit(en: Entry) {
    switchDate(day(en.date));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  const words = content.trim() ? content.trim().split(/\s+/).length : 0;
  const s = stats.data;
  const list = entries.data ?? [];

  return (
    <>
      <h1>Diary</h1>

      <div className="grid g3">
        <div className="card stat">
          <div className="label">Writing streak</div>
          <div className="value">🔥 {s ? <CountUp value={s.streak} /> : '–'}</div>
        </div>
        <div className="card stat">
          <div className="label">This month</div>
          <div className="value">{s ? <CountUp value={s.thisMonth} /> : '–'}</div>
        </div>
        <div className="card stat">
          <div className="label">All entries</div>
          <div className="value">{s ? <CountUp value={s.total} /> : '–'}</div>
        </div>
      </div>

      <form className="card" onSubmit={save}>
        <div className="row" style={{ justifyContent: 'space-between', marginBottom: 14 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 600 }}>{longDate(date)}</div>
            <div className="muted">
              {existing ? "Editing this day's entry" : date === t ? "Today's page is blank" : 'A new entry'}
            </div>
          </div>
          <input type="date" max={t} value={date} onChange={(e) => switchDate(e.target.value)} style={{ flex: '0 0 auto' }} aria-label="Entry date" />
        </div>

        <div className="moods" role="radiogroup" aria-label="How was your day?">
          {MOODS.map((m) => (
            <button
              key={m.key}
              type="button"
              role="radio"
              aria-checked={mood === m.key}
              aria-label={m.label}
              title={m.label}
              className={mood === m.key ? 'on' : ''}
              onClick={() => touch(setMood)(mood === m.key ? null : m.key)}
            >
              <span>{m.emoji}</span>
            </button>
          ))}
        </div>

        <input
          style={{ width: '100%', marginTop: 14 }}
          placeholder="Title (optional)"
          maxLength={120}
          value={title}
          onChange={(e) => touch(setTitle)(e.target.value)}
        />
        <textarea
          ref={area}
          className="diary-area"
          style={{ marginTop: 10 }}
          placeholder={PROMPTS[Number(date.slice(8, 10)) % PROMPTS.length]}
          maxLength={20000}
          value={content}
          onChange={(e) => touch(setContent)(e.target.value)}
          onKeyDown={onKey}
        />

        <div className="diary-meta">
          <span className="muted">
            {dirty ? <span className="dirty-dot">Unsaved changes</span> : `${words} ${words === 1 ? 'word' : 'words'}`}
          </span>
          <span className="muted hide-touch">Ctrl + Enter to save</span>
          <button className="primary relative" disabled={saving}>
            {saving ? 'Saving…' : existing ? 'Update entry' : 'Save entry'}
            {burst && <Burst />}
          </button>
        </div>
      </form>

      <div className="card">
        <input
          type="search"
          style={{ width: '100%', marginBottom: 12 }}
          placeholder="Search everything you've written…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />

        {q ? (
          <div className="muted" style={{ marginBottom: 6 }}>{list.length} result{list.length === 1 ? '' : 's'} for “{q}”</div>
        ) : (
          <div className="month-nav">
            <button type="button" onClick={() => setMonth(shiftMonth(month, -1))} aria-label="Previous month">‹</button>
            <strong>{monthLabel(month)}</strong>
            <button type="button" onClick={() => setMonth(shiftMonth(month, 1))} disabled={month >= thisMonth()} aria-label="Next month">›</button>
          </div>
        )}

        {entries.error && <div className="error">{entries.error}</div>}

        {entries.loading && !entries.data && (
          <>
            <div className="skeleton-row"><span className="skeleton tall" style={{ width: 54 }} /><span className="skeleton" style={{ flex: 1 }} /></div>
            <div className="skeleton-row"><span className="skeleton tall" style={{ width: 54 }} /><span className="skeleton" style={{ flex: 1 }} /></div>
          </>
        )}

        {entries.data && list.length === 0 && (
          <div className="empty">
            <span className="emoji">{q ? '🔍' : '📔'}</span>
            {q ? 'Nothing matches that.' : `Nothing written in ${monthLabel(month)} yet.`}
          </div>
        )}

        <ul className="list">
          {list.map((en) => {
            const d = day(en.date);
            const long = en.content.length > 160 || en.content.split('\n').length > 3;
            const open = openId === en.id;
            return (
              <li key={en.id} className={`entry ${isLeaving(en.id) ? 'leaving' : ''}`}>
                <div className="entry-date">
                  <span className="dow">{fmt(d, { weekday: 'short' })}</span>
                  <span className="dom">{fmt(d, { day: 'numeric' })}</span>
                  <span className="mon">{fmt(d, { month: 'short' })}</span>
                </div>
                <div className="grow">
                  <div className="entry-head">
                    {en.mood && <span className="mood" title={en.mood.toLowerCase()}>{emojiOf(en.mood)}</span>}
                    {en.title && <strong><Highlight text={en.title} q={q} /></strong>}
                  </div>
                  <p className={`entry-text ${long && !open ? 'clamped' : ''}`}><Highlight text={en.content} q={q} /></p>
                  {long && (
                    <button type="button" className="link ghost entry-more" onClick={() => setOpenId(open ? null : en.id)}>
                      {open ? 'Show less' : 'Read more'}
                    </button>
                  )}
                </div>
                <button className="ghost edit" onClick={() => edit(en)} aria-label="Edit entry">✎</button>
                <button className="ghost" onClick={() => remove(en)} aria-label="Delete entry">✕</button>
              </li>
            );
          })}
        </ul>
      </div>
    </>
  );
}
