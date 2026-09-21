import { Link, useLocation } from 'react-router-dom';
import { api, day, notify, todosChanged } from '../api';
import { useAlerts } from '../alerts';

const shortDate = (iso: string) =>
  new Date(`${day(iso)}T00:00:00Z`).toLocaleDateString(undefined, { day: 'numeric', month: 'short', timeZone: 'UTC' });

/** Shown on every page while unfinished tasks are overdue or due today. */
export default function AlertBanner() {
  const { overdue, dueToday, count, snoozed, snooze } = useAlerts();
  const onTodos = useLocation().pathname === '/todos';

  if (count === 0 || snoozed) return null;

  const items = [...overdue, ...dueToday];
  const shown = items.slice(0, 3);

  async function done(id: number) {
    try {
      await api(`/todos/${id}`, 'PATCH', { done: true });
    } catch {
      return; // the failure toast is shown by api()
    }
    notify('Task done 🎉');
    todosChanged();
  }

  const summary = overdue.length
    ? `${overdue.length} overdue${dueToday.length ? ` · ${dueToday.length} due today` : ''}`
    : `${dueToday.length} due today`;

  return (
    <div className={`alert-banner ${overdue.length ? 'overdue' : ''}`} role="alert">
      <div className="alert-head">
        <span className="alert-icon" aria-hidden>{overdue.length ? '⏰' : '📝'}</span>
        <strong>{summary} — not finished yet</strong>
        <div className="alert-actions">
          {!onTodos && <Link to="/todos" className="alert-link">Open to-do</Link>}
          <button type="button" className="ghost" onClick={() => snooze(60)} title="Hide this and mute notifications for an hour">
            Snooze 1h
          </button>
        </div>
      </div>
      <ul className="alert-list">
        {shown.map((t) => {
          const late = overdue.includes(t);
          return (
            <li key={t.id}>
              <button type="button" className="alert-done" onClick={() => done(t.id)} aria-label={`Mark "${t.title}" done`} title="Mark done">✓</button>
              <span className="alert-title">{t.title}</span>
              <span className={`alert-when ${late ? 'late' : ''}`}>{late ? `Overdue · ${shortDate(t.dueDate!)}` : 'Due today'}</span>
            </li>
          );
        })}
        {items.length > shown.length && <li className="muted">…and {items.length - shown.length} more</li>}
      </ul>
    </div>
  );
}
