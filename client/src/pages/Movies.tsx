import { FormEvent, useMemo, useState } from 'react';
import { api, day, notify, today, useApi } from '../api';
import Burst from '../components/Burst';
import CountUp from '../components/CountUp';
import { useLeaving } from '../hooks';

type Status = 'WATCHING' | 'WATCHED' | 'WANT';
type Reaction = 'LOVED' | 'OKAY' | 'HATED';
type Kind = 'MOVIE' | 'SERIES';
interface Movie {
  id: number;
  title: string;
  kind: Kind;
  status: Status;
  reaction: Reaction | null;
  favorite: boolean;
  rating: number | null;
  platform: string | null;
  review: string | null;
  watchedOn: string | null;
}

const STATUSES: { key: Status; emoji: string; label: string }[] = [
  { key: 'WATCHING', emoji: '📺', label: 'Watching' },
  { key: 'WATCHED', emoji: '✅', label: 'Watched' },
  { key: 'WANT', emoji: '🔖', label: 'Want to watch' },
];
const REACTIONS: { key: Reaction; emoji: string; label: string }[] = [
  { key: 'LOVED', emoji: '😍', label: 'Loved it' },
  { key: 'OKAY', emoji: '😐', label: 'It was okay' },
  { key: 'HATED', emoji: '🤮', label: 'Hated it' },
];
const emojiOf = (s: Status) => STATUSES.find((x) => x.key === s)!.emoji;
const reactionOf = (r: Reaction | null) => REACTIONS.find((x) => x.key === r);
const ORDER: Record<Status, number> = { WATCHING: 0, WATCHED: 1, WANT: 2 };
const PLATFORMS = ['Netflix', 'Prime Video', 'Hotstar', 'YouTube', 'Theatre', 'TV'];

const fmt = (iso: string) =>
  new Date(`${day(iso)}T00:00:00Z`).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
const stars = (n: number) => '★'.repeat(n) + '☆'.repeat(5 - n);

export default function Movies() {
  const t = today();
  const movies = useApi<Movie[]>('/movies');
  const { isLeaving, leave } = useLeaving();

  const [filter, setFilter] = useState<'ALL' | Status>('ALL');
  const [pick, setPick] = useState<'FAVORITE' | Reaction | null>(null); // Favorites / Loved / Hated chips
  const [search, setSearch] = useState('');
  const [openId, setOpenId] = useState<number | null>(null);
  const [burst, setBurst] = useState(false);

  // the form
  const [editId, setEditId] = useState<number | null>(null);
  const [wasWatched, setWasWatched] = useState(false);
  const [title, setTitle] = useState('');
  const [kind, setKind] = useState<Kind>('MOVIE');
  const [status, setStatus] = useState<Status>('WATCHED');
  const [reaction, setReaction] = useState<Reaction | null>(null);
  const [favorite, setFavorite] = useState(false);
  const [rating, setRating] = useState<number | null>(null);
  const [platform, setPlatform] = useState('');
  const [review, setReview] = useState('');
  const [watchedOn, setWatchedOn] = useState(t);

  function reset() {
    setEditId(null);
    setWasWatched(false);
    setTitle('');
    setKind('MOVIE');
    setStatus('WATCHED');
    setReaction(null);
    setFavorite(false);
    setRating(null);
    setPlatform('');
    setReview('');
    setWatchedOn(t);
  }

  function startEdit(m: Movie) {
    setEditId(m.id);
    setWasWatched(m.status === 'WATCHED');
    setTitle(m.title);
    setKind(m.kind);
    setStatus(m.status);
    setReaction(m.reaction);
    setFavorite(m.favorite);
    setRating(m.rating);
    setPlatform(m.platform ?? '');
    setReview(m.review ?? '');
    setWatchedOn(m.watchedOn ? day(m.watchedOn) : t);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    const body = {
      title: title.trim(),
      kind,
      status,
      reaction: status === 'WANT' ? null : reaction,
      favorite,
      rating: status === 'WATCHED' ? rating : null,
      platform: platform.trim() || null,
      review: review.trim() || null,
      watchedOn: status === 'WATCHED' ? watchedOn || t : null,
    };
    try {
      if (editId) await api(`/movies/${editId}`, 'PUT', body);
      else await api('/movies', 'POST', body);
    } catch {
      return; // the failure toast is shown by api()
    }
    const justWatched = status === 'WATCHED' && !wasWatched;
    notify(justWatched ? 'Added to your watched list 🎬' : editId ? 'Updated' : 'Added');
    if (justWatched) { setBurst(true); setTimeout(() => setBurst(false), 900); }
    reset();
    movies.reload();
  }

  // Quick changes straight from the list (heart, reaction, move along).
  async function patch(m: Movie, change: Partial<Pick<Movie, 'favorite' | 'reaction' | 'status'>>, message?: string) {
    try {
      await api(`/movies/${m.id}`, 'PATCH', change);
    } catch {
      return;
    }
    if (message) notify(message);
    movies.reload();
  }

  function remove(m: Movie) {
    if (!confirm(`Delete "${m.title}"${m.review ? ' and your review' : ''}?`)) return;
    leave(m.id, async () => {
      await api(`/movies/${m.id}`, 'DELETE');
      notify('Deleted');
      if (editId === m.id) reset();
      movies.reload();
    }).catch(() => { /* failure toast already shown */ });
  }

  const list = movies.data ?? [];

  const stats = useMemo(() => {
    const watched = list.filter((m) => m.status === 'WATCHED');
    const year = t.slice(0, 4);
    return {
      watched: watched.length,
      thisYear: watched.filter((m) => m.watchedOn && day(m.watchedOn).startsWith(year)).length,
      watching: list.filter((m) => m.status === 'WATCHING').length,
      favorites: list.filter((m) => m.favorite).length,
      loved: list.filter((m) => m.reaction === 'LOVED').length,
      hated: list.filter((m) => m.reaction === 'HATED').length,
    };
  }, [list, t]);

  const counts = { ALL: list.length, WATCHING: 0, WATCHED: 0, WANT: 0 };
  for (const m of list) counts[m.status]++;

  const q = search.trim().toLowerCase();
  const shown = list
    .filter((m) => filter === 'ALL' || m.status === filter)
    .filter((m) => pick === null || (pick === 'FAVORITE' ? m.favorite : m.reaction === pick))
    .filter((m) => !q || [m.title, m.platform ?? '', m.review ?? ''].some((x) => x.toLowerCase().includes(q)))
    .sort((a, b) => ORDER[a.status] - ORDER[b.status] || (a.status === 'WATCHED' ? (b.watchedOn ?? '').localeCompare(a.watchedOn ?? '') : 0));

  return (
    <>
      <h1>Movies</h1>

      <div className="grid g4">
        <div className="card stat"><div className="label">🎬 Watched</div><div className="value"><CountUp value={stats.watched} /></div></div>
        <div className="card stat"><div className="label">This year</div><div className="value"><CountUp value={stats.thisYear} /></div></div>
        <div className="card stat"><div className="label">📺 Watching now</div><div className="value"><CountUp value={stats.watching} /></div></div>
        <div className="card stat"><div className="label">⭐ Favorites</div><div className="value"><CountUp value={stats.favorites} /></div></div>
      </div>

      <form className="card" onSubmit={save}>
        <h2 style={{ marginBottom: 10 }}>{editId ? 'Edit' : 'Add a movie or series'}</h2>

        <div className="row">
          <input style={{ flex: '2 1 200px' }} placeholder="Title" maxLength={200} value={title} onChange={(e) => setTitle(e.target.value)} />
          <input style={{ flex: '1 1 140px' }} placeholder="Where? (Netflix, theatre…)" maxLength={60} list="movie-platforms" value={platform} onChange={(e) => setPlatform(e.target.value)} />
          <datalist id="movie-platforms">{PLATFORMS.map((p) => <option key={p} value={p} />)}</datalist>
        </div>

        <div className="row" style={{ marginTop: 10 }}>
          <div className="seg" role="radiogroup" aria-label="Type">
            {([['MOVIE', '🎞️ Movie'], ['SERIES', '📡 Series']] as const).map(([k, label]) => (
              <button key={k} type="button" role="radio" aria-checked={kind === k} className={kind === k ? 'on' : ''} onClick={() => setKind(k)}>{label}</button>
            ))}
          </div>
          <button type="button" className={`fav-toggle ${favorite ? 'on' : ''}`} aria-pressed={favorite} onClick={() => setFavorite(!favorite)}>
            {favorite ? '⭐ Favorite' : '☆ Mark favorite'}
          </button>
        </div>

        <div className="seg book-status" role="radiogroup" aria-label="Status" style={{ marginTop: 10 }}>
          {STATUSES.map((s) => (
            <button key={s.key} type="button" role="radio" aria-checked={status === s.key} className={status === s.key ? 'on' : ''} onClick={() => setStatus(s.key)}>
              {s.emoji} {s.label}
            </button>
          ))}
        </div>

        {status !== 'WANT' && (
          <div className="seg book-status" role="radiogroup" aria-label="How did you feel about it?" style={{ marginTop: 10 }}>
            {REACTIONS.map((r) => (
              <button key={r.key} type="button" role="radio" aria-checked={reaction === r.key} className={reaction === r.key ? 'on' : ''} onClick={() => setReaction(reaction === r.key ? null : r.key)}>
                {r.emoji} {r.label}
              </button>
            ))}
          </div>
        )}

        {status === 'WATCHED' && (
          <>
            <div className="row" style={{ marginTop: 10 }}>
              <label className="field">Watched on<input type="date" max={t} value={watchedOn} onChange={(e) => setWatchedOn(e.target.value)} /></label>
            </div>
            <div className="rate" role="radiogroup" aria-label="Rating">
              <span className="muted">Rating</span>
              {[1, 2, 3, 4, 5].map((n) => (
                <button key={n} type="button" role="radio" aria-checked={rating === n} aria-label={`${n} star${n > 1 ? 's' : ''}`} className={`star ${rating !== null && n <= rating ? 'on' : ''}`} onClick={() => setRating(rating === n ? null : n)}>
                  ★
                </button>
              ))}
            </div>
          </>
        )}

        {status !== 'WANT' && (
          <>
            <label className="moral-label" htmlFor="review">💬 What did you think? Why did you love or hate it?</label>
            <textarea
              id="review"
              className="moral-input"
              placeholder="e.g. Loved the ending, the music was amazing. The middle dragged a bit."
              maxLength={5000}
              value={review}
              onChange={(e) => setReview(e.target.value)}
              rows={3}
            />
          </>
        )}

        <div className="row" style={{ marginTop: 12 }}>
          <button className="primary relative">
            {editId ? 'Save changes' : status === 'WATCHED' ? 'Add watched' : 'Add'}
            {burst && <Burst />}
          </button>
          {editId && <button type="button" onClick={reset}>Cancel</button>}
        </div>
      </form>

      <div className="card">
        <input type="search" style={{ width: '100%', marginBottom: 12 }} placeholder="Search titles, where you watched and your reviews…" value={search} onChange={(e) => setSearch(e.target.value)} />

        <div className="tabs" style={{ marginBottom: 8 }}>
          {([['ALL', 'All'], ['WATCHING', 'Watching'], ['WATCHED', 'Watched'], ['WANT', 'To watch']] as const).map(([key, label]) => (
            <button key={key} type="button" className={filter === key ? 'on' : ''} onClick={() => setFilter(key)}>
              {label} <span className="count">{counts[key]}</span>
            </button>
          ))}
        </div>

        <div className="chips" style={{ marginTop: 0, marginBottom: 6 }}>
          {([['FAVORITE', '⭐ Favorites', stats.favorites], ['LOVED', '😍 Loved', stats.loved], ['HATED', '🤮 Hated', stats.hated]] as const).map(([key, label, n]) => (
            <button key={key} type="button" className={`chip-btn ${pick === key ? 'on' : ''}`} aria-pressed={pick === key} onClick={() => setPick(pick === key ? null : key)}>
              {label} <span className="count">{n}</span>
            </button>
          ))}
        </div>

        {movies.error && <div className="error">{movies.error}</div>}
        {movies.loading && !movies.data && [0, 1].map((i) => (
          <div className="skeleton-row" key={i}><span className="skeleton tall" style={{ width: 48 }} /><span className="skeleton" style={{ flex: 1 }} /></div>
        ))}
        {movies.data && shown.length === 0 && (
          <div className="empty">
            <span className="emoji">🎬</span>
            {list.length === 0 ? 'Nothing here yet: add the last movie you watched' : 'Nothing matches that'}
          </div>
        )}

        <ul className="list">
          {shown.map((m) => {
            const r = reactionOf(m.reaction);
            const long = !!m.review && (m.review.length > 180 || m.review.split('\n').length > 3);
            const open = openId === m.id;
            return (
              <li key={m.id} className={`book movie ${isLeaving(m.id) ? 'leaving' : ''}`}>
                <div className={`book-cover ${m.status.toLowerCase()}`} aria-hidden>{emojiOf(m.status)}</div>
                <div className="grow">
                  <div className="title">
                    <strong>{m.title}</strong>
                    <span className="muted"> · {m.kind === 'SERIES' ? 'Series' : 'Movie'}{m.platform ? ` · ${m.platform}` : ''}</span>
                  </div>

                  <div className="muted book-meta">
                    {r && <span className={`reaction ${r.key.toLowerCase()}`}>{r.emoji} {r.label}</span>}
                    {m.status === 'WATCHED' && m.rating != null && <span className="stars-static" aria-label={`${m.rating} out of 5`}>{stars(m.rating)}</span>}
                    {m.status === 'WATCHED' && m.watchedOn && <span>watched {fmt(m.watchedOn)}</span>}
                    {m.status === 'WATCHING' && <span>watching now</span>}
                    {m.status === 'WANT' && <span>on your list</span>}
                  </div>

                  {m.review && (
                    <blockquote className="moral">
                      <span className="moral-tag">💬 My take</span>
                      <p className={long && !open ? 'clamped' : ''}>{m.review}</p>
                      {long && <button type="button" className="link ghost entry-more" onClick={() => setOpenId(open ? null : m.id)}>{open ? 'Show less' : 'Read more'}</button>}
                    </blockquote>
                  )}

                  <div className="movie-actions">
                    {m.status === 'WANT' && <button type="button" className="finish-btn" onClick={() => patch(m, { status: 'WATCHING' }, 'Enjoy! 🍿')}>▶ Start watching</button>}
                    {m.status === 'WATCHING' && <button type="button" className="finish-btn" onClick={() => patch(m, { status: 'WATCHED' }, 'Finished — how was it? ✎')}>✓ I finished it</button>}
                    {m.status !== 'WANT' && REACTIONS.map((x) => (
                      <button key={x.key} type="button" className={`react-btn ${m.reaction === x.key ? 'on' : ''}`} aria-pressed={m.reaction === x.key} title={x.label} aria-label={x.label} onClick={() => patch(m, { reaction: m.reaction === x.key ? null : x.key })}>
                        {x.emoji}
                      </button>
                    ))}
                  </div>
                </div>
                <button className={`ghost fav ${m.favorite ? 'on' : ''}`} onClick={() => patch(m, { favorite: !m.favorite }, m.favorite ? undefined : 'Added to favorites ⭐')} aria-pressed={m.favorite} aria-label={m.favorite ? 'Remove from favorites' : 'Add to favorites'} title="Favorite">
                  {m.favorite ? '⭐' : '☆'}
                </button>
                <button className="ghost edit" onClick={() => startEdit(m)} aria-label="Edit">✎</button>
                <button className="ghost" onClick={() => remove(m)} aria-label="Delete">✕</button>
              </li>
            );
          })}
        </ul>
      </div>
    </>
  );
}
