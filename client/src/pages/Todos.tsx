import { FormEvent, useEffect, useState } from 'react';
import { api, day, notify, todosChanged, useApi } from '../api';
import ReminderSettings from '../components/ReminderSettings';
import { useLeaving } from '../hooks';

interface Todo {
  id: number;
  title: string;
  priority: 'LOW' | 'MEDIUM' | 'HIGH';
  done: boolean;
  dueDate: string | null;
}

export default function Todos() {
  const { data, error, loading, reload } = useApi<Todo[]>('/todos');
  const { isLeaving, leave } = useLeaving();

  // The alerts banner can complete tasks too; it announces that with this event.
  useEffect(() => {
    window.addEventListener('todos:changed', reload);
    return () => window.removeEventListener('todos:changed', reload);
  }, [reload]);
  const [editId, setEditId] = useState<number | null>(null);
  const [title, setTitle] = useState('');
  const [priority, setPriority] = useState('MEDIUM');
  const [dueDate, setDueDate] = useState('');

  function reset() {
    setEditId(null);
    setTitle('');
    setPriority('MEDIUM');
    setDueDate('');
  }

  function startEdit(t: Todo) {
    setEditId(t.id);
    setTitle(t.title);
    setPriority(t.priority);
    setDueDate(t.dueDate ? day(t.dueDate) : '');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    const body = { title: title.trim(), priority, dueDate: dueDate || null };
    if (editId) await api(`/todos/${editId}`, 'PATCH', body);
    else await api('/todos', 'POST', body);
    notify(editId ? 'Task updated' : 'Task added');
    reset();
    todosChanged();
  }

  const toggle = async (t: Todo) => {
    await api(`/todos/${t.id}`, 'PATCH', { done: !t.done });
    if (!t.done) notify('Task done 🎉');
    todosChanged();
  };
  const remove = (t: Todo) =>
    leave(t.id, async () => {
      await api(`/todos/${t.id}`, 'DELETE');
      if (editId === t.id) reset();
      todosChanged();
    }).catch(() => { /* failure toast already shown */ });

  const open = data?.filter((t) => !t.done) ?? [];
  const finished = data?.filter((t) => t.done) ?? [];

  const renderItem = (t: Todo) => (
    <li key={t.id} className={`${t.done ? 'done' : ''} ${isLeaving(t.id) ? 'leaving' : ''}`}>
      <input type="checkbox" checked={t.done} onChange={() => toggle(t)} />
      <div className="grow">
        <div className="title">{t.title}</div>
        {t.dueDate && <div className="muted">Due {day(t.dueDate)}</div>}
      </div>
      {!t.done && <span className={`badge ${t.priority}`}>{t.priority.toLowerCase()}</span>}
      <button className="ghost edit" onClick={() => startEdit(t)} aria-label="Edit">✎</button>
      <button className="ghost" onClick={() => remove(t)} aria-label="Delete">✕</button>
    </li>
  );

  return (
    <>
      <h1>To-do</h1>
      <form className="card row" onSubmit={save}>
        <input style={{ flex: '3 1 200px' }} placeholder="What needs doing?" value={title} onChange={(e) => setTitle(e.target.value)} />
        <select value={priority} onChange={(e) => setPriority(e.target.value)}>
          <option value="LOW">Low</option>
          <option value="MEDIUM">Medium</option>
          <option value="HIGH">High</option>
        </select>
        <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
        <button className="primary">{editId ? 'Save' : 'Add'}</button>
        {editId && <button type="button" onClick={reset}>Cancel</button>}
      </form>

      <ReminderSettings />

      {error && <div className="error">{error}</div>}
      {loading && !data && (
        <div className="card">
          {[0, 1, 2].map((i) => (
            <div className="skeleton-row" key={i}><span className="skeleton" style={{ width: 24, height: 24 }} /><span className="skeleton" style={{ flex: 1 }} /></div>
          ))}
        </div>
      )}

      {data && (
        <>
          <div className="card">
            <h2>Open ({open.length})</h2>
            {open.length ? <ul className="list">{open.map(renderItem)}</ul> : <div className="empty"><span className="emoji">🎉</span>Nothing to do</div>}
          </div>
          {finished.length > 0 && (
            <div className="card">
              <h2>Done ({finished.length})</h2>
              <ul className="list">{finished.map(renderItem)}</ul>
            </div>
          )}
        </>
      )}
    </>
  );
}
