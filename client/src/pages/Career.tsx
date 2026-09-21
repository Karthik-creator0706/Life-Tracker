import { FormEvent, useState } from 'react';
import { api, day, notify, today, useApi } from '../api';
import { BarChart, HBars } from '../components/Charts';
import CountUp from '../components/CountUp';
import Burst from '../components/Burst';
import { CareerTask, Horizon, bucketTasks, dueFor, fmtMinutes, shiftDay, studyProgress } from '../careerLogic';
import { useLeaving } from '../hooks';

interface Study { id: number; date: string; topic: string; subject: string | null; minutes: number; notes: string | null }
interface TopicRow { topic: string; minutes: number; sessions: number }
interface Overview {
  goalMinutes: number | null;
  streak: number;
  studyDays: number;
  today: { minutes: number; sessions: number; topics: TopicRow[] };
  week: { minutes: number; sessions: number; topics: TopicRow[] };
  month: { minutes: number; sessions: number; topics: TopicRow[] };
  days: { date: string; minutes: number }[];
  subjects: { subject: string; minutes: number }[];
  recentTopics: { topic: string; subject: string | null; count: number }[];
}

const QUICK_MINUTES = [15, 30, 45, 60, 90];
const fmtDay = (d: string, o: Intl.DateTimeFormatOptions) => new Date(`${d}T00:00:00Z`).toLocaleDateString(undefined, { ...o, timeZone: 'UTC' });
const num = (s: string) => (s.trim() === '' ? null : Math.round(Number(s)));

export default function Career() {
  const t = today();
  const [date, setDate] = useState(t);
  const overview = useApi<Overview>(`/career/overview?today=${t}`);
  const sessions = useApi<Study[]>(`/career/study?date=${date}`);
  const tasks = useApi<CareerTask[]>(`/career/tasks?today=${t}`);
  const { isLeaving, leave } = useLeaving();

  // ---- study form ----
  const [editId, setEditId] = useState<number | null>(null);
  const [topic, setTopic] = useState('');
  const [subject, setSubject] = useState('');
  const [minutes, setMinutes] = useState('30');
  const [notes, setNotes] = useState('');
  const [topicsTab, setTopicsTab] = useState<'today' | 'week' | 'month'>('today');
  const [editingGoal, setEditingGoal] = useState(false);
  const [goalInput, setGoalInput] = useState('');

  // ---- task form ----
  const [taskEditId, setTaskEditId] = useState<number | null>(null);
  const [taskTitle, setTaskTitle] = useState('');
  const [taskSubject, setTaskSubject] = useState('');
  const [when, setWhen] = useState<Horizon | 'DATE'>('TODAY');
  const [taskDate, setTaskDate] = useState(t);
  const [burst, setBurst] = useState(false);

  const dayLabel = date === t ? 'Today' : date === shiftDay(t, -1) ? 'Yesterday' : fmtDay(date, { weekday: 'long', day: 'numeric', month: 'short' });
  const reloadStudy = () => { sessions.reload(); overview.reload(); };

  function resetStudy() {
    setEditId(null);
    setTopic('');
    setNotes('');
  }

  function startEdit(s: Study) {
    setEditId(s.id);
    setTopic(s.topic);
    setSubject(s.subject ?? '');
    setMinutes(String(s.minutes));
    setNotes(s.notes ?? '');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function saveStudy(e: FormEvent) {
    e.preventDefault();
    const mins = num(minutes);
    if (!topic.trim()) return;
    if (!mins || mins < 1) { notify('How many minutes did you study?', 'error'); return; }
    const body = { date, topic: topic.trim(), subject: subject.trim() || null, minutes: mins, notes: notes.trim() || null };
    try {
      if (editId) await api(`/career/study/${editId}`, 'PUT', body);
      else await api('/career/study', 'POST', body);
    } catch {
      return; // failure toast shown by api()
    }
    notify(editId ? 'Study session updated' : `📚 ${fmtMinutes(mins)} of ${body.topic} logged`);
    resetStudy(); // keep the subject and minutes: you often log several topics in a row
    reloadStudy();
  }

  const removeStudy = (s: Study) =>
    leave(`s${s.id}`, async () => {
      await api(`/career/study/${s.id}`, 'DELETE');
      notify('Session removed');
      if (editId === s.id) resetStudy();
      reloadStudy();
    }).catch(() => { /* toast already shown */ });

  async function saveGoal(e: FormEvent) {
    e.preventDefault();
    const n = num(goalInput);
    if (!n) return;
    try { await api('/career/goal', 'PUT', { studyGoalMin: n }); } catch { return; }
    notify(`Daily study goal: ${fmtMinutes(n)}`);
    setEditingGoal(false);
    overview.reload();
  }
  async function clearGoal() {
    try { await api('/career/goal', 'PUT', { studyGoalMin: null }); } catch { return; }
    notify('Goal removed');
    setEditingGoal(false);
    overview.reload();
  }

  // ---- tasks ----
  function resetTask() {
    setTaskEditId(null);
    setTaskTitle('');
  }

  function startEditTask(task: CareerTask) {
    setTaskEditId(task.id);
    setTaskTitle(task.title);
    setTaskSubject(task.subject ?? '');
    setWhen('DATE');
    setTaskDate(day(task.dueDate));
    window.scrollTo({ top: document.getElementById('career-tasks')?.offsetTop ?? 0, behavior: 'smooth' });
  }

  async function saveTask(e: FormEvent) {
    e.preventDefault();
    if (!taskTitle.trim()) return;
    const dueDate = when === 'DATE' ? taskDate : dueFor(when, t);
    if (!dueDate) { notify('Pick a due date', 'error'); return; }
    const body = { title: taskTitle.trim(), subject: taskSubject.trim() || null, dueDate };
    try {
      if (taskEditId) await api(`/career/tasks/${taskEditId}`, 'PATCH', body);
      else await api('/career/tasks', 'POST', body);
    } catch {
      return;
    }
    notify(taskEditId ? 'Task updated' : 'Task added');
    resetTask();
    tasks.reload();
  }

  async function toggleTask(task: CareerTask) {
    try { await api(`/career/tasks/${task.id}`, 'PATCH', { done: !task.done }); } catch { return; }
    if (!task.done) {
      notify('Task done 🎉');
      // if that was the last thing left for today, celebrate
      const left = bucketTasks(allTasks, t);
      if (left.overdue.length + left.today.length === 1 && [...left.overdue, ...left.today][0].id === task.id) {
        setBurst(true);
        setTimeout(() => setBurst(false), 900);
        notify("That's everything for today ✨");
      }
    }
    tasks.reload();
  }

  const removeTask = (task: CareerTask) =>
    leave(`t${task.id}`, async () => {
      await api(`/career/tasks/${task.id}`, 'DELETE');
      notify('Task deleted');
      if (taskEditId === task.id) resetTask();
      tasks.reload();
    }).catch(() => { /* toast already shown */ });

  // ---- derived ----
  const ov = overview.data;
  const allTasks = tasks.data ?? [];
  const groups = bucketTasks(allTasks, t);
  const doneList = allTasks.filter((x) => x.done);
  const todayLeft = groups.overdue.length + groups.today.length;
  const progress = studyProgress(ov?.today.minutes ?? 0, ov?.goalMinutes ?? null);
  const topicsPeriod = ov ? ov[topicsTab] : null;
  const dayTotal = (sessions.data ?? []).reduce((s, x) => s + x.minutes, 0);

  const dueLabel = (task: CareerTask) => {
    const d = day(task.dueDate);
    if (task.done) return `due ${fmtDay(d, { day: 'numeric', month: 'short' })}`;
    if (d < t) {
      const n = Math.round((Date.parse(t) - Date.parse(d)) / 86_400_000);
      return `${n} day${n === 1 ? '' : 's'} late`;
    }
    return d === t ? 'Today' : fmtDay(d, { weekday: 'short', day: 'numeric', month: 'short' });
  };

  const TaskRow = ({ task, late = false }: { task: CareerTask; late?: boolean }) => (
    <li key={task.id} className={`${task.done ? 'done' : ''} ${isLeaving(`t${task.id}`) ? 'leaving' : ''}`}>
      <input type="checkbox" checked={task.done} onChange={() => toggleTask(task)} aria-label={`Mark "${task.title}" ${task.done ? 'not done' : 'done'}`} />
      <div className="grow">
        <div className="title">{task.title}</div>
        <div className="muted">
          <span className={late ? 'late-tag' : ''}>{dueLabel(task)}</span>
          {task.subject && <> · {task.subject}</>}
        </div>
      </div>
      <button className="ghost edit" onClick={() => startEditTask(task)} aria-label="Edit">✎</button>
      <button className="ghost" onClick={() => removeTask(task)} aria-label="Delete">✕</button>
    </li>
  );

  // NB: rendered as a function call (not <TaskRow/>), so rows aren't re-created on every keystroke.
  const section = (title: string, hint: string, list: CareerTask[], late = false) =>
    list.length === 0 ? null : (
      <div className="task-section">
        <div className="task-head"><strong>{title}</strong><span className="muted">{list.length} · {hint}</span></div>
        <ul className="list">{list.map((x) => TaskRow({ task: x, late }))}</ul>
      </div>
    );

  const openCount = groups.overdue.length + groups.today.length + groups.week.length + groups.month.length + groups.later.length;

  return (
    <>
      <h1>Career</h1>

      <div className="grid g4">
        <div className="card stat"><div className="label">📚 Studied today</div><div className="value"><CountUp value={ov?.today.minutes ?? 0} format={fmtMinutes} /></div></div>
        <div className="card stat"><div className="label">Topics today</div><div className="value"><CountUp value={ov?.today.topics.length ?? 0} /></div></div>
        <div className="card stat"><div className="label">🔥 Study streak</div><div className="value"><CountUp value={ov?.streak ?? 0} /> <small className="muted">{ov?.streak === 1 ? 'day' : 'days'}</small></div></div>
        <div className="card stat"><div className="label">✅ Tasks left today</div><div className="value"><CountUp value={todayLeft} /></div></div>
      </div>

      {/* goal + today's progress */}
      <div className="card">
        <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div className="label muted">Study time · today</div>
            <div className="cal-big">
              {fmtMinutes(ov?.today.minutes ?? 0)}
              <span className="muted"> {ov?.goalMinutes ? `/ ${fmtMinutes(ov.goalMinutes)}` : ''}</span>
            </div>
          </div>
          <button type="button" className="ghost edit" onClick={() => { setGoalInput(ov?.goalMinutes ? String(ov.goalMinutes) : '120'); setEditingGoal((v) => !v); }}>
            {ov?.goalMinutes ? '✎ Goal' : '+ Set goal'}
          </button>
        </div>
        {progress.kind !== 'none' ? (
          <>
            <div className="bar cal-bar"><span className={progress.kind === 'met' ? 'met' : ''} style={{ width: `${progress.pct}%` }} /></div>
            <div className={progress.kind === 'met' ? 'pos' : 'muted'} style={{ marginTop: 6, fontWeight: progress.kind === 'met' ? 600 : 400 }}>
              {progress.kind === 'met' ? '🎯 Daily goal reached!' : `${fmtMinutes(progress.left)} to go today`}
            </div>
          </>
        ) : (
          !editingGoal && <div className="muted" style={{ marginTop: 6 }}>Set a daily study goal to track your progress.</div>
        )}
        {ov && ov.today.topics.length > 0 && (
          <div className="chips" style={{ marginTop: 12 }} aria-label="Topics covered today">
            {ov.today.topics.map((x) => <span className="chip static" key={x.topic}>{x.topic} · {fmtMinutes(x.minutes)}</span>)}
          </div>
        )}
        {editingGoal && (
          <form className="row" style={{ marginTop: 12 }} onSubmit={saveGoal}>
            <input type="number" inputMode="numeric" min="10" max="1440" step="5" placeholder="Minutes per day" value={goalInput} onChange={(e) => setGoalInput(e.target.value)} autoFocus aria-label="Daily study goal in minutes" />
            <button className="primary">Save goal</button>
            {ov?.goalMinutes && <button type="button" onClick={clearGoal}>Remove</button>}
            <button type="button" onClick={() => setEditingGoal(false)}>Cancel</button>
          </form>
        )}
      </div>

      {/* log study */}
      <div className="month-nav">
        <button type="button" onClick={() => setDate(shiftDay(date, -1))} aria-label="Previous day">‹</button>
        <strong>{dayLabel}</strong>
        <button type="button" onClick={() => setDate(shiftDay(date, 1))} disabled={date >= t} aria-label="Next day">›</button>
      </div>

      <form className="card" onSubmit={saveStudy}>
        <h2 style={{ marginBottom: 10 }}>{editId ? 'Edit study session' : `What did you study — ${dayLabel.toLowerCase()}?`}</h2>
        <div className="row">
          <input style={{ flex: '2 1 200px' }} placeholder="Topic covered, e.g. React hooks" maxLength={120} value={topic} onChange={(e) => setTopic(e.target.value)} list="career-topics" autoComplete="off" />
          <input style={{ flex: '1 1 140px' }} placeholder="Subject (optional)" maxLength={60} value={subject} onChange={(e) => setSubject(e.target.value)} list="career-subjects" autoComplete="off" />
        </div>
        <datalist id="career-topics">{ov?.recentTopics.map((r) => <option key={r.topic} value={r.topic} />)}</datalist>
        <datalist id="career-subjects">{ov?.subjects.filter((s) => s.subject !== 'General').map((s) => <option key={s.subject} value={s.subject} />)}</datalist>

        {!editId && ov && ov.recentTopics.length > 0 && (
          <div className="chips" aria-label="Topics you study often">
            {ov.recentTopics.map((r) => (
              <button key={r.topic} type="button" className="chip" onClick={() => { setTopic(r.topic); setSubject(r.subject ?? ''); }} title={`Studied ${r.count}×`}>{r.topic}</button>
            ))}
          </div>
        )}

        <div className="row" style={{ marginTop: 10 }}>
          <input style={{ flex: '0 1 120px' }} type="number" inputMode="numeric" min="1" max="1440" placeholder="Minutes" value={minutes} onChange={(e) => setMinutes(e.target.value)} aria-label="Minutes studied" />
          <div className="chips" style={{ margin: 0 }}>
            {QUICK_MINUTES.map((m) => (
              <button key={m} type="button" className={`chip ${minutes === String(m) ? 'on' : ''}`} onClick={() => setMinutes(String(m))}>{fmtMinutes(m)}</button>
            ))}
          </div>
        </div>

        <textarea style={{ width: '100%', marginTop: 10, lineHeight: 1.6 }} rows={3} maxLength={2000} placeholder="What did you learn? Key points, questions, what to revisit… (optional)" value={notes} onChange={(e) => setNotes(e.target.value)} />

        <div className="row" style={{ marginTop: 12 }}>
          <button className="primary">{editId ? 'Save changes' : 'Log study time'}</button>
          {editId && <button type="button" onClick={resetStudy}>Cancel</button>}
        </div>
      </form>

      <div className="card">
        <div className="insight-head">
          <h2 style={{ margin: 0 }}>{dayLabel}'s study</h2>
          {dayTotal > 0 && <span className="muted">{fmtMinutes(dayTotal)} in total</span>}
        </div>
        {sessions.error && <div className="error">{sessions.error}</div>}
        {sessions.loading && !sessions.data && [0, 1].map((i) => <div className="skeleton-row" key={i}><span className="skeleton" style={{ flex: 1 }} /><span className="skeleton" style={{ width: 50 }} /></div>)}
        {sessions.data && sessions.data.length === 0 && <div className="empty"><span className="emoji">🎓</span>Nothing logged for {dayLabel.toLowerCase()} yet</div>}
        <ul className="list">
          {sessions.data?.map((s) => (
            <li key={s.id} className={isLeaving(`s${s.id}`) ? 'leaving' : ''} style={{ alignItems: 'flex-start' }}>
              <div className="grow">
                <div className="title"><strong>{s.topic}</strong>{s.subject && <span className="badge" style={{ marginLeft: 8 }}>{s.subject}</span>}</div>
                {s.notes && <div className="muted study-notes">{s.notes}</div>}
              </div>
              <span className="kcal">{fmtMinutes(s.minutes)}</span>
              <button className="ghost edit" onClick={() => startEdit(s)} aria-label="Edit">✎</button>
              <button className="ghost" onClick={() => removeStudy(s)} aria-label="Delete">✕</button>
            </li>
          ))}
        </ul>
      </div>

      {/* topics covered */}
      <div className="card">
        <div className="insight-head">
          <h2 style={{ margin: 0 }}>Topics covered</h2>
          {topicsPeriod && <span className="muted">{fmtMinutes(topicsPeriod.minutes)} · {topicsPeriod.sessions} {topicsPeriod.sessions === 1 ? 'session' : 'sessions'}</span>}
        </div>
        <div className="tabs" style={{ marginBottom: 12 }}>
          {([['today', 'Today'], ['week', 'This week'], ['month', 'This month']] as const).map(([k, label]) => (
            <button key={k} type="button" className={topicsTab === k ? 'on' : ''} onClick={() => setTopicsTab(k)}>{label}</button>
          ))}
        </div>
        {topicsPeriod && topicsPeriod.topics.length > 0 ? (
          <HBars items={topicsPeriod.topics.map((x) => ({ label: x.topic, value: x.minutes }))} format={fmtMinutes} />
        ) : (
          <div className="empty"><span className="emoji">🗒️</span>No topics {topicsTab === 'today' ? 'today' : topicsTab === 'week' ? 'in the last 7 days' : 'this month'} yet</div>
        )}
      </div>

      {/* tasks */}
      <form className="card relative" id="career-tasks" onSubmit={saveTask}>
        <h2 style={{ marginBottom: 10 }}>{taskEditId ? 'Edit task' : 'Career tasks'}</h2>
        <div className="row">
          <input style={{ flex: '3 1 220px' }} placeholder="e.g. Finish the React course module 4" maxLength={200} value={taskTitle} onChange={(e) => setTaskTitle(e.target.value)} />
          <input style={{ flex: '1 1 140px' }} placeholder="Subject (optional)" maxLength={60} value={taskSubject} onChange={(e) => setTaskSubject(e.target.value)} list="career-subjects" autoComplete="off" />
        </div>
        <div className="row" style={{ marginTop: 10 }}>
          <div className="seg when-seg" role="radiogroup" aria-label="Finish by">
            {([['TODAY', 'Today'], ['WEEK', 'This week'], ['MONTH', 'This month'], ['DATE', 'Pick a date']] as const).map(([k, label]) => (
              <button key={k} type="button" role="radio" aria-checked={when === k} className={when === k ? 'on' : ''} onClick={() => setWhen(k)}>{label}</button>
            ))}
          </div>
          {when === 'DATE' && <input type="date" value={taskDate} onChange={(e) => setTaskDate(e.target.value)} aria-label="Due date" />}
        </div>
        <div className="muted" style={{ marginTop: 8 }}>
          {when !== 'DATE' ? <>Due <strong>{fmtDay(dueFor(when, t), { weekday: 'long', day: 'numeric', month: 'short' })}</strong></> : ' '}
        </div>
        <div className="row" style={{ marginTop: 8 }}>
          <button className="primary">{taskEditId ? 'Save task' : 'Add task'}</button>
          {taskEditId && <button type="button" onClick={resetTask}>Cancel</button>}
        </div>
        {burst && <Burst />}
      </form>

      <div className="card">
        <div className="insight-head">
          <h2 style={{ margin: 0 }}>Your tasks</h2>
          <span className="muted">{openCount} open</span>
        </div>
        {tasks.error && <div className="error">{tasks.error}</div>}
        {tasks.loading && !tasks.data && [0, 1, 2].map((i) => <div className="skeleton-row" key={i}><span className="skeleton" style={{ width: 24, height: 24 }} /><span className="skeleton" style={{ flex: 1 }} /></div>)}
        {tasks.data && openCount === 0 && doneList.length === 0 && <div className="empty"><span className="emoji">🎯</span>No career tasks yet — add what you need to finish</div>}
        {tasks.data && openCount === 0 && doneList.length > 0 && <div className="empty"><span className="emoji">🎉</span>Everything is done — nice work</div>}

        {section('⚠️ Overdue', 'past their date', groups.overdue, true)}
        {section('📅 Today', 'finish by tonight', groups.today)}
        {section('🗓️ This week', `by ${fmtDay(dueFor('WEEK', t), { weekday: 'long' })}`, groups.week)}
        {section('🗂️ This month', `by ${fmtDay(dueFor('MONTH', t), { day: 'numeric', month: 'short' })}`, groups.month)}
        {section('🔭 Later', 'further ahead', groups.later)}
        {section('✅ Done recently', 'last 7 days', doneList)}
      </div>

      {/* charts */}
      {ov && ov.days.some((d) => d.minutes > 0) && (
        <div className="card">
          <div className="insight-head"><h2 style={{ margin: 0 }}>Study time</h2><span className="muted">last 14 days</span></div>
          <BarChart
            height={180}
            label="Study minutes per day"
            format={fmtMinutes}
            reference={ov.goalMinutes ? { value: ov.goalMinutes, label: `Goal ${fmtMinutes(ov.goalMinutes)}` } : undefined}
            data={ov.days.map((d) => ({ label: String(Number(d.date.slice(8, 10))), value: d.minutes, caption: fmtDay(d.date, { weekday: 'long', day: 'numeric', month: 'short' }) }))}
          />
        </div>
      )}
      {ov && ov.subjects.length > 0 && (
        <div className="card">
          <div className="insight-head"><h2 style={{ margin: 0 }}>Time by subject</h2><span className="muted">last 30 days</span></div>
          <HBars items={ov.subjects.map((s) => ({ label: s.subject, value: s.minutes }))} format={fmtMinutes} />
        </div>
      )}
    </>
  );
}
