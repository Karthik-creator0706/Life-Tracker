import { FormEvent, useMemo, useRef, useState } from 'react';
import { api, day, notify, today, useApi } from '../api';
import Burst from '../components/Burst';
import CountUp from '../components/CountUp';
import { useLeaving } from '../hooks';

type Status = 'READING' | 'FINISHED' | 'WANT';
interface Book {
  id: number;
  title: string;
  author: string | null;
  status: Status;
  totalPages: number | null;
  currentPage: number | null;
  rating: number | null;
  moral: string | null;
  startedOn: string | null;
  finishedOn: string | null;
}

const STATUSES: { key: Status; emoji: string; label: string }[] = [
  { key: 'READING', emoji: '📖', label: 'Reading' },
  { key: 'FINISHED', emoji: '✅', label: 'Finished' },
  { key: 'WANT', emoji: '🔖', label: 'Want to read' },
];
const emojiOf = (s: Status) => STATUSES.find((x) => x.key === s)!.emoji;
const ORDER: Record<Status, number> = { READING: 0, FINISHED: 1, WANT: 2 };

const fmt = (iso: string) =>
  new Date(`${day(iso)}T00:00:00Z`).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
const stars = (n: number) => '★'.repeat(n) + '☆'.repeat(5 - n);
const num = (s: string) => (s.trim() === '' ? null : Math.round(Number(s)));

export default function Books() {
  const t = today();
  const books = useApi<Book[]>('/books');
  const { isLeaving, leave } = useLeaving();

  const [filter, setFilter] = useState<'ALL' | Status>('ALL');
  const [search, setSearch] = useState('');
  const [openId, setOpenId] = useState<number | null>(null);
  const [burst, setBurst] = useState(false);
  const moralRef = useRef<HTMLTextAreaElement>(null);

  // the form
  const [editId, setEditId] = useState<number | null>(null);
  const [wasFinished, setWasFinished] = useState(false);
  const [title, setTitle] = useState('');
  const [author, setAuthor] = useState('');
  const [status, setStatus] = useState<Status>('READING');
  const [totalPages, setTotalPages] = useState('');
  const [currentPage, setCurrentPage] = useState('');
  const [rating, setRating] = useState<number | null>(null);
  const [moral, setMoral] = useState('');
  const [startedOn, setStartedOn] = useState('');
  const [finishedOn, setFinishedOn] = useState(t);

  function reset() {
    setEditId(null);
    setWasFinished(false);
    setTitle('');
    setAuthor('');
    setStatus('READING');
    setTotalPages('');
    setCurrentPage('');
    setRating(null);
    setMoral('');
    setStartedOn('');
    setFinishedOn(t);
  }

  function startEdit(b: Book, finishNow = false) {
    setEditId(b.id);
    setWasFinished(b.status === 'FINISHED');
    setTitle(b.title);
    setAuthor(b.author ?? '');
    setStatus(finishNow ? 'FINISHED' : b.status);
    setTotalPages(b.totalPages != null ? String(b.totalPages) : '');
    setCurrentPage(b.currentPage != null ? String(b.currentPage) : '');
    setRating(b.rating);
    setMoral(b.moral ?? '');
    setStartedOn(b.startedOn ? day(b.startedOn) : '');
    setFinishedOn(b.finishedOn ? day(b.finishedOn) : t);
    window.scrollTo({ top: 0, behavior: 'smooth' });
    if (finishNow) setTimeout(() => moralRef.current?.focus(), 400); // finishing a book: jump to "what did you learn?"
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    const body = {
      title: title.trim(),
      author: author.trim() || null,
      status,
      totalPages: num(totalPages),
      currentPage: status === 'READING' ? num(currentPage) : null,
      rating: status === 'FINISHED' ? rating : null,
      moral: moral.trim() || null,
      startedOn: startedOn || null,
      finishedOn: status === 'FINISHED' ? finishedOn || t : null,
    };
    try {
      if (editId) await api(`/books/${editId}`, 'PUT', body);
      else await api('/books', 'POST', body);
    } catch {
      return; // the failure toast is shown by api()
    }
    const justFinished = status === 'FINISHED' && !wasFinished;
    notify(justFinished ? 'Book finished — nice one! 📚' : editId ? 'Book updated' : 'Book added');
    if (justFinished) { setBurst(true); setTimeout(() => setBurst(false), 900); }
    reset();
    books.reload();
  }

  function remove(b: Book) {
    if (!confirm(`Delete "${b.title}"${b.moral ? ' and the moral you saved' : ''}?`)) return;
    leave(b.id, async () => {
      await api(`/books/${b.id}`, 'DELETE');
      notify('Book deleted');
      if (editId === b.id) reset();
      books.reload();
    }).catch(() => { /* failure toast already shown */ });
  }

  const list = books.data ?? [];

  const stats = useMemo(() => {
    const finished = list.filter((b) => b.status === 'FINISHED');
    const year = t.slice(0, 4);
    return {
      finished: finished.length,
      thisYear: finished.filter((b) => b.finishedOn && day(b.finishedOn).startsWith(year)).length,
      reading: list.filter((b) => b.status === 'READING').length,
      morals: list.filter((b) => b.moral).length,
      pages:
        finished.reduce((s, b) => s + (b.totalPages ?? 0), 0) +
        list.filter((b) => b.status === 'READING').reduce((s, b) => s + (b.currentPage ?? 0), 0),
    };
  }, [list, t]);

  const counts = { ALL: list.length, READING: 0, FINISHED: 0, WANT: 0 };
  for (const b of list) counts[b.status]++;

  const q = search.trim().toLowerCase();
  const shown = list
    .filter((b) => (filter === 'ALL' || b.status === filter) && (!q || [b.title, b.author ?? '', b.moral ?? ''].some((x) => x.toLowerCase().includes(q))))
    .sort((a, b) => ORDER[a.status] - ORDER[b.status] || (a.status === 'FINISHED' ? (b.finishedOn ?? '').localeCompare(a.finishedOn ?? '') : 0));

  return (
    <>
      <h1>Books</h1>

      <div className="grid g4">
        <div className="card stat"><div className="label">📚 Books read</div><div className="value"><CountUp value={stats.finished} /></div></div>
        <div className="card stat"><div className="label">This year</div><div className="value"><CountUp value={stats.thisYear} /></div></div>
        <div className="card stat"><div className="label">📖 Reading now</div><div className="value"><CountUp value={stats.reading} /></div></div>
        <div className="card stat"><div className="label">💡 Morals saved</div><div className="value"><CountUp value={stats.morals} /></div></div>
      </div>
      {stats.pages > 0 && <div className="muted" style={{ margin: '-4px 0 16px' }}>📄 About {stats.pages.toLocaleString()} pages read so far</div>}

      <form className="card" onSubmit={save}>
        <h2 style={{ marginBottom: 10 }}>{editId ? 'Edit book' : 'Add a book'}</h2>

        <div className="row">
          <input style={{ flex: '2 1 200px' }} placeholder="Book title" maxLength={200} value={title} onChange={(e) => setTitle(e.target.value)} />
          <input style={{ flex: '1 1 150px' }} placeholder="Author (optional)" maxLength={120} value={author} onChange={(e) => setAuthor(e.target.value)} />
        </div>

        <div className="seg book-status" role="radiogroup" aria-label="Status" style={{ marginTop: 10 }}>
          {STATUSES.map((s) => (
            <button key={s.key} type="button" role="radio" aria-checked={status === s.key} className={status === s.key ? 'on' : ''} onClick={() => setStatus(s.key)}>
              {s.emoji} {s.label}
            </button>
          ))}
        </div>

        <div className="row" style={{ marginTop: 10 }}>
          <input style={{ flex: '1 1 110px' }} type="number" inputMode="numeric" min="1" max="20000" placeholder="Total pages" value={totalPages} onChange={(e) => setTotalPages(e.target.value)} />
          {status === 'READING' && (
            <input style={{ flex: '1 1 110px' }} type="number" inputMode="numeric" min="0" max="20000" placeholder="Page I'm on" value={currentPage} onChange={(e) => setCurrentPage(e.target.value)} />
          )}
          {status !== 'WANT' && (
            <label className="field">Started<input type="date" max={t} value={startedOn} onChange={(e) => setStartedOn(e.target.value)} /></label>
          )}
          {status === 'FINISHED' && (
            <label className="field">Finished<input type="date" max={t} value={finishedOn} onChange={(e) => setFinishedOn(e.target.value)} /></label>
          )}
        </div>

        {status === 'FINISHED' && (
          <div className="rate" role="radiogroup" aria-label="Rating">
            <span className="muted">Rating</span>
            {[1, 2, 3, 4, 5].map((n) => (
              <button key={n} type="button" role="radio" aria-checked={rating === n} aria-label={`${n} star${n > 1 ? 's' : ''}`} className={`star ${rating !== null && n <= rating ? 'on' : ''}`} onClick={() => setRating(rating === n ? null : n)}>
                ★
              </button>
            ))}
          </div>
        )}

        {status !== 'WANT' && (
          <>
            <label className="moral-label" htmlFor="moral">💡 What's the moral — the lesson you got from this book?</label>
            <textarea
              id="moral"
              ref={moralRef}
              className="moral-input"
              placeholder="e.g. Small habits compound — get 1% better every day."
              maxLength={5000}
              value={moral}
              onChange={(e) => setMoral(e.target.value)}
              rows={3}
            />
          </>
        )}

        <div className="row" style={{ marginTop: 12 }}>
          <button className="primary relative">
            {editId ? 'Save changes' : status === 'FINISHED' ? 'Add finished book' : 'Add book'}
            {burst && <Burst />}
          </button>
          {editId && <button type="button" onClick={reset}>Cancel</button>}
        </div>
      </form>

      <div className="card">
        <input type="search" style={{ width: '100%', marginBottom: 12 }} placeholder="Search titles, authors and morals…" value={search} onChange={(e) => setSearch(e.target.value)} />

        <div className="tabs" style={{ marginBottom: 8 }}>
          {([['ALL', 'All'], ['READING', 'Reading'], ['FINISHED', 'Read'], ['WANT', 'To read']] as const).map(([key, label]) => (
            <button key={key} type="button" className={filter === key ? 'on' : ''} onClick={() => setFilter(key)}>
              {label} <span className="count">{counts[key]}</span>
            </button>
          ))}
        </div>

        {books.error && <div className="error">{books.error}</div>}
        {books.loading && !books.data && [0, 1].map((i) => (
          <div className="skeleton-row" key={i}><span className="skeleton tall" style={{ width: 48 }} /><span className="skeleton" style={{ flex: 1 }} /></div>
        ))}
        {books.data && shown.length === 0 && (
          <div className="empty">
            <span className="emoji">📚</span>
            {list.length === 0 ? 'No books yet — add the one you are reading' : 'Nothing matches that'}
          </div>
        )}

        <ul className="list">
          {shown.map((b) => {
            const pct = b.totalPages && b.currentPage != null ? Math.min(100, (b.currentPage / b.totalPages) * 100) : null;
            const long = !!b.moral && (b.moral.length > 180 || b.moral.split('\n').length > 3);
            const open = openId === b.id;
            return (
              <li key={b.id} className={`book ${isLeaving(b.id) ? 'leaving' : ''}`}>
                <div className={`book-cover ${b.status.toLowerCase()}`} aria-hidden>{emojiOf(b.status)}</div>
                <div className="grow">
                  <div className="title"><strong>{b.title}</strong>{b.author && <span className="muted"> · {b.author}</span>}</div>

                  <div className="muted book-meta">
                    {b.status === 'FINISHED' && b.rating != null && <span className="stars-static" aria-label={`${b.rating} out of 5`}>{stars(b.rating)}</span>}
                    {b.status === 'FINISHED' && b.finishedOn && <span>finished {fmt(b.finishedOn)}</span>}
                    {b.status === 'READING' && b.startedOn && <span>started {fmt(b.startedOn)}</span>}
                    {b.status === 'WANT' && <span>on your list</span>}
                    {b.totalPages != null && b.status !== 'READING' && <span>{b.totalPages.toLocaleString()} pages</span>}
                  </div>

                  {b.status === 'READING' && pct !== null && (
                    <>
                      <div className="bar" style={{ marginTop: 6 }}><span style={{ width: `${pct}%` }} /></div>
                      <div className="muted" style={{ marginTop: 3 }}>page {b.currentPage} of {b.totalPages} · {Math.round(pct)}%</div>
                    </>
                  )}

                  {b.moral ? (
                    <blockquote className="moral">
                      <span className="moral-tag">💡 Moral</span>
                      <p className={long && !open ? 'clamped' : ''}>{b.moral}</p>
                      {long && <button type="button" className="link ghost entry-more" onClick={() => setOpenId(open ? null : b.id)}>{open ? 'Show less' : 'Read more'}</button>}
                    </blockquote>
                  ) : (
                    b.status === 'FINISHED' && (
                      <button type="button" className="link ghost entry-more" onClick={() => startEdit(b)}>＋ What was the moral?</button>
                    )
                  )}

                  {b.status === 'READING' && (
                    <button type="button" className="finish-btn" onClick={() => startEdit(b, true)}>✓ I finished it</button>
                  )}
                </div>
                <button className="ghost edit" onClick={() => startEdit(b)} aria-label="Edit">✎</button>
                <button className="ghost" onClick={() => remove(b)} aria-label="Delete">✕</button>
              </li>
            );
          })}
        </ul>
      </div>
    </>
  );
}
