import { FormEvent, useMemo, useState } from 'react';
import { api, day, money, notify, thisMonth, today, useApi } from '../api';
import { BarChart } from '../components/Charts';
import CountUp from '../components/CountUp';
import { useLeaving } from '../hooks';

interface Tx {
  id: number;
  type: 'INCOME' | 'EXPENSE';
  amount: number;
  category: string;
  note: string | null;
  date: string;
}
interface Summary {
  income: number;
  expense: number;
  balance: number;
  byCategory: Record<string, number>;
}

const EXPENSE_CATS = ['Food', 'Rent', 'Transport', 'Bills', 'Shopping', 'Health', 'Fun', 'Other'];
const INCOME_CATS = ['Salary', 'Freelance', 'Gift', 'Other'];

export default function Money() {
  const [month, setMonth] = useState(thisMonth());
  const txs = useApi<Tx[]>(`/transactions?month=${month}`);
  const summary = useApi<Summary>(`/transactions/summary?month=${month}`);
  const { isLeaving, leave } = useLeaving();

  const [editId, setEditId] = useState<number | null>(null);
  const [type, setType] = useState<'INCOME' | 'EXPENSE'>('EXPENSE');
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState(EXPENSE_CATS[0]);
  const [note, setNote] = useState('');
  const [date, setDate] = useState(today());

  const reloadAll = () => { txs.reload(); summary.reload(); };

  function pickType(t: 'INCOME' | 'EXPENSE') {
    setType(t);
    setCategory((t === 'INCOME' ? INCOME_CATS : EXPENSE_CATS)[0]);
  }

  function reset() {
    setEditId(null);
    setAmount('');
    setNote('');
  }

  function startEdit(t: Tx) {
    setEditId(t.id);
    setType(t.type);
    setAmount(String(t.amount));
    setCategory(t.category);
    setNote(t.note ?? '');
    setDate(day(t.date));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    const n = Number(amount);
    if (!n || n <= 0) return;
    const body = { type, amount: n, category, note: note || null, date };
    if (editId) await api(`/transactions/${editId}`, 'PUT', body);
    else await api('/transactions', 'POST', body);
    notify(editId ? 'Transaction updated' : type === 'INCOME' ? 'Income added' : 'Expense added');
    reset();
    reloadAll();
  }

  const remove = (t: Tx) =>
    leave(t.id, async () => {
      await api(`/transactions/${t.id}`, 'DELETE');
      notify('Transaction deleted');
      if (editId === t.id) reset();
      reloadAll();
    }).catch(() => { /* failure toast already shown */ });

  const s = summary.data;
  const cats = s ? Object.entries(s.byCategory).sort((a, b) => b[1] - a[1]) : [];
  // Include the row's current category even if it isn't one of the presets (e.g. added directly in SQL).
  const catOptions = (type === 'INCOME' ? INCOME_CATS : EXPENSE_CATS).includes(category)
    ? type === 'INCOME' ? INCOME_CATS : EXPENSE_CATS
    : [category, ...(type === 'INCOME' ? INCOME_CATS : EXPENSE_CATS)];

  // Spending per day of the selected month, for the column chart.
  const daily = useMemo(() => {
    const [y, m] = month.split('-').map(Number);
    const monthName = new Date(y, m - 1, 1).toLocaleDateString(undefined, { month: 'short' });
    const perDay = new Array<number>(new Date(y, m, 0).getDate()).fill(0);
    for (const t of txs.data ?? []) if (t.type === 'EXPENSE') perDay[Number(day(t.date).slice(8, 10)) - 1] += t.amount;
    return perDay.map((value, i) => ({ label: String(i + 1), value, caption: `${i + 1} ${monthName}` }));
  }, [txs.data, month]);
  const hasSpending = daily.some((d) => d.value > 0);

  return (
    <>
      <h1>Money</h1>
      <div className="row" style={{ marginBottom: 12 }}>
        <input type="month" value={month} onChange={(e) => e.target.value && setMonth(e.target.value)} />
      </div>

      <div className="grid g3">
        <div className="card stat"><div className="label">Income</div><div className="value pos"><CountUp value={s?.income ?? 0} format={money} /></div></div>
        <div className="card stat"><div className="label">Spent</div><div className="value neg"><CountUp value={s?.expense ?? 0} format={money} /></div></div>
        <div className="card stat"><div className="label">Balance</div><div className={`value ${(s?.balance ?? 0) >= 0 ? 'pos' : 'neg'}`}><CountUp value={s?.balance ?? 0} format={money} /></div></div>
      </div>

      <form className="card row" onSubmit={save}>
        <select value={type} onChange={(e) => pickType(e.target.value as 'INCOME' | 'EXPENSE')}>
          <option value="EXPENSE">Expense</option>
          <option value="INCOME">Income</option>
        </select>
        <input type="number" inputMode="decimal" min="0" step="0.01" placeholder="Amount" value={amount} onChange={(e) => setAmount(e.target.value)} />
        <select value={category} onChange={(e) => setCategory(e.target.value)}>
          {catOptions.map((c) => <option key={c}>{c}</option>)}
        </select>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        <input placeholder="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
        <button className="primary">{editId ? 'Save' : 'Add'}</button>
        {editId && <button type="button" onClick={reset}>Cancel</button>}
      </form>

      {hasSpending && (
        <div className="card">
          <h2>Daily spending</h2>
          <BarChart data={daily} format={money} label="Daily spending this month" />
        </div>
      )}

      {cats.length > 0 && (
        <div className="card">
          <h2>Where it went</h2>
          {cats.map(([name, amt]) => (
            <div key={name} style={{ marginBottom: 10 }}>
              <div className="row" style={{ justifyContent: 'space-between' }}><span>{name}</span><span className="muted">{money(amt)}</span></div>
              <div className="bar"><span style={{ width: `${(amt / (s?.expense || 1)) * 100}%` }} /></div>
            </div>
          ))}
        </div>
      )}

      <div className="card">
        <h2>Transactions</h2>
        {txs.error && <div className="error">{txs.error}</div>}
        {txs.data?.length === 0 && <div className="empty"><span className="emoji">💸</span>Nothing this month yet</div>}
        {txs.loading && !txs.data && [0, 1, 2].map((i) => (
          <div className="skeleton-row" key={i}><span className="skeleton" style={{ flex: 1 }} /><span className="skeleton" style={{ width: 70 }} /></div>
        ))}
        <ul className="list">
          {txs.data?.map((t) => (
            <li key={t.id} className={isLeaving(t.id) ? 'leaving' : ''}>
              <div className="grow">
                <div className="title">{t.category}{t.note ? ` · ${t.note}` : ''}</div>
                <div className="muted">{day(t.date)}</div>
              </div>
              <strong className={t.type === 'INCOME' ? 'pos' : 'neg'}>{t.type === 'INCOME' ? '+' : '−'}{money(t.amount)}</strong>
              <button className="ghost edit" onClick={() => startEdit(t)} aria-label="Edit">✎</button>
              <button className="ghost" onClick={() => remove(t)} aria-label="Delete">✕</button>
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}
