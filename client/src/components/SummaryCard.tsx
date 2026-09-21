import { ReactNode } from 'react';
import { Link } from 'react-router-dom';

export interface Stat { label: string; value: ReactNode; tone?: 'pos' | 'neg'; small?: boolean } // small = a word rather than a number

const plain = { color: 'inherit', textDecoration: 'none' } as const;

/** The dashboard's standard "area" card: title, a row of key numbers, then whatever detail you pass as children. Tap = open that page. */
export function SummaryCard({ to, title, cta = 'Open', stats, wide = false, children }: {
  to: string;
  title: string;
  cta?: string;
  stats: Stat[];
  wide?: boolean;
  children?: ReactNode;
}) {
  return (
    <Link to={to} className={`card summary ${wide ? 'wide' : ''}`} style={plain}>
      <div className="summary-head">
        <h2>{title}</h2>
        <span className="summary-cta">{cta} →</span>
      </div>
      <div className="sum-stats" style={{ gridTemplateColumns: `repeat(${stats.length}, minmax(0, 1fr))` }}>
        {stats.map((s) => (
          <div key={s.label}>
            <div className="label">{s.label}</div>
            <div className={`value ${s.tone ?? ''} ${s.small ? 'small' : ''}`}>{s.value}</div>
          </div>
        ))}
      </div>
      {children}
    </Link>
  );
}

export interface MiniBar { key: string; label: string; value: number; title: string }

/** A small column chart; each bar is scaled to the busiest one. Hover a bar for its exact value. */
export function MiniBars({ items, label }: { items: MiniBar[]; label: string }) {
  const busiest = Math.max(...items.map((i) => i.value), 0);
  return (
    <div className="mini-bars" style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }} role="img" aria-label={label}>
      {items.map((i) => (
        <div className="mini-col" key={i.key} title={i.title}>
          <div className="mini-track">
            <span className={`mini-bar ${i.value === 0 ? 'zero' : ''}`} style={{ height: i.value === 0 ? undefined : `${Math.max(8, (i.value / busiest) * 100)}%` }} />
          </div>
          <span className="mini-day">{i.label}</span>
        </div>
      ))}
    </div>
  );
}
