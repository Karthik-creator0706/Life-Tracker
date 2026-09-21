import { KeyboardEvent, PointerEvent, useEffect, useRef, useState } from 'react';

/* Small dependency-free SVG charts (single series). Colors come from CSS variables in styles.css. */

const DEFAULT_H = 210;
const PAD = { t: 22, r: 14, b: 26 };

function useWidth() {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(320);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => setW(Math.max(240, Math.floor(el.clientWidth)));
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

function niceTicks(min: number, max: number, count = 4): number[] {
  if (min === max) { min -= 1; max += 1; }
  const raw = (max - min) / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const f = raw / mag;
  const step = (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * mag;
  const ticks: number[] = [];
  for (let v = Math.floor(min / step) * step; v <= Math.ceil(max / step) * step + step / 2; v += step) {
    ticks.push(Number(v.toFixed(10)));
  }
  return ticks;
}

const fmtTick = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 1 });
const shortDate = (ms: number) => new Date(ms).toLocaleDateString(undefined, { day: 'numeric', month: 'short', timeZone: 'UTC' });

interface TipProps { x: number; y: number; width: number; value: string; caption: string }

function Tip({ x, y, width, value, caption }: TipProps) {
  return (
    <div className="chart-tip" style={{ left: Math.min(Math.max(x, 56), width - 56), top: Math.max(0, y - 58) }}>
      <strong><i className="key" />{value}</strong>
      <span>{caption}</span>
    </div>
  );
}

/** Shared pointer + arrow-key handling: maps an x position to the nearest of `n` slots. */
function useActive(n: number, slotAt: (px: number) => number) {
  const [active, setActive] = useState<number | null>(null);
  return {
    active,
    clear: () => setActive(null),
    handlers: {
      onPointerMove: (e: PointerEvent<SVGSVGElement>) => {
        const box = e.currentTarget.getBoundingClientRect();
        setActive(Math.min(n - 1, Math.max(0, slotAt(e.clientX - box.left))));
      },
      onPointerLeave: () => setActive(null),
      onFocus: () => setActive((a) => a ?? n - 1),
      onBlur: () => setActive(null),
      onKeyDown: (e: KeyboardEvent<SVGSVGElement>) => {
        if (e.key === 'ArrowLeft') { e.preventDefault(); setActive((a) => Math.max(0, (a ?? n) - 1)); }
        if (e.key === 'ArrowRight') { e.preventDefault(); setActive((a) => Math.min(n - 1, (a ?? -1) + 1)); }
      },
    },
  };
}

/* ---------------------------------------------------------------- Line */

export interface LinePoint { date: string; value: number } // date = YYYY-MM-DD, ascending

export function LineChart({ data, format, label, height = DEFAULT_H }: { data: LinePoint[]; format: (n: number) => string; label: string; height?: number }) {
  const H = height;
  const [ref, width] = useWidth();
  const n = data.length;
  const times = data.map((d) => Date.parse(d.date));
  const vals = data.map((d) => d.value);

  const lo = Math.min(...vals);
  const hi = Math.max(...vals);
  const pad = (hi - lo) * 0.15 || 1;
  const ticks = niceTicks(lo - pad, hi + pad, 4);
  const yMin = ticks[0];
  const yMax = ticks[ticks.length - 1];

  const left = Math.max(...ticks.map((t) => fmtTick(t).length)) * 7 + 14;
  const plotW = width - left - PAD.r;
  const plotH = H - PAD.t - PAD.b;
  const t0 = times[0];
  const t1 = times[n - 1];
  const px = (t: number) => left + (t1 === t0 ? plotW / 2 : ((t - t0) / (t1 - t0)) * plotW);
  const py = (v: number) => PAD.t + plotH - ((v - yMin) / (yMax - yMin)) * plotH;

  const nearest = (x: number) => {
    let best = 0;
    for (let i = 1; i < n; i++) if (Math.abs(px(times[i]) - x) < Math.abs(px(times[best]) - x)) best = i;
    return best;
  };
  const { active, handlers } = useActive(n, nearest);

  const line = data.map((d, i) => `${i ? 'L' : 'M'}${px(times[i]).toFixed(1)},${py(d.value).toFixed(1)}`).join('');
  const area = `${line}L${px(t1).toFixed(1)},${PAD.t + plotH}L${px(t0).toFixed(1)},${PAD.t + plotH}Z`;
  const xTicks = n === 1 ? [t0] : [0, 1, 2, 3].map((i) => t0 + ((t1 - t0) * i) / 3);
  const last = n - 1;

  return (
    <div className="chart" ref={ref}>
      <svg
        width={width}
        height={H}
        role="img"
        aria-label={`${label}: ${n} entries, latest ${format(vals[last])}. Use arrow keys to browse.`}
        tabIndex={0}
        {...handlers}
      >
        {ticks.map((t) => (
          <g key={t}>
            <line x1={left} x2={width - PAD.r} y1={py(t)} y2={py(t)} className="gl" />
            <text x={left - 8} y={py(t) + 4} textAnchor="end" className="tick">{fmtTick(t)}</text>
          </g>
        ))}
        {xTicks.map((t, i) => (
          <text
            key={t}
            x={px(t)}
            y={H - 6}
            className="tick"
            textAnchor={n === 1 ? 'middle' : i === 0 ? 'start' : i === xTicks.length - 1 ? 'end' : 'middle'}
          >
            {shortDate(t)}
          </text>
        ))}

        {n > 1 && <path d={area} className="area" />}
        {n > 1 && <path d={line} className="line" pathLength={1} />}

        {active !== null && <line x1={px(times[active])} x2={px(times[active])} y1={PAD.t} y2={PAD.t + plotH} className="gl crosshair" />}

        {/* end marker (ringed) with its value; the active point gets the same mark */}
        <circle cx={px(times[last])} cy={py(vals[last])} r={5} className="dot dot-end" />
        {active !== null && active !== last && <circle cx={px(times[active])} cy={py(vals[active])} r={5} className="dot" />}
        {active === null && (
          // Keep the label off the line: below the dot when the line drops into it, above otherwise.
          <text
            x={Math.min(px(times[last]), width - PAD.r)}
            y={py(vals[last]) + (n > 1 && vals[last - 1] > vals[last] ? 22 : -12)}
            textAnchor="end"
            className="endlabel"
          >
            {format(vals[last])}
          </text>
        )}
      </svg>
      {active !== null && (
        <Tip x={px(times[active])} y={py(vals[active])} width={width} value={format(vals[active])} caption={shortDate(times[active])} />
      )}
    </div>
  );
}

/* ----------------------------------------------------------------- Bar */

export interface BarItem { label: string; value: number; caption: string }

export function BarChart({
  data,
  format,
  label,
  reference,
  height = DEFAULT_H,
}: {
  data: BarItem[];
  format: (n: number) => string;
  label: string;
  height?: number;
  /** Optional target line (e.g. a daily goal). */
  reference?: { value: number; label: string };
}) {
  const H = height;
  const [ref, width] = useWidth();
  const n = data.length;
  const max = Math.max(...data.map((d) => d.value), 0);
  const ticks = niceTicks(0, Math.max(max, reference?.value ?? 0) || 1, 4);
  const yMax = ticks[ticks.length - 1];

  const left = Math.max(...ticks.map((t) => fmtTick(t).length)) * 7 + 14;
  const plotW = width - left - PAD.r;
  const plotH = H - PAD.t - PAD.b;
  const base = PAD.t + plotH;
  const band = plotW / n;
  const barW = Math.max(2, Math.min(24, band - 2));
  const py = (v: number) => base - (v / yMax) * plotH;

  const { active, handlers } = useActive(n, (x) => Math.floor((x - left) / band));
  const step = Math.ceil(n / Math.max(1, Math.floor(plotW / 34)));
  const maxIdx = max > 0 ? data.findIndex((d) => d.value === max) : -1;

  const barPath = (x: number, v: number) => {
    const y = py(v);
    const r = Math.min(4, (base - y) / 2, barW / 2);
    return `M${x},${base}V${y + r}Q${x},${y} ${x + r},${y}H${x + barW - r}Q${x + barW},${y} ${x + barW},${y + r}V${base}Z`;
  };
  const cx = (i: number) => left + i * band + band / 2;

  return (
    <div className="chart" ref={ref}>
      <svg
        width={width}
        height={H}
        role="img"
        aria-label={`${label}: ${n} days, highest ${max ? format(max) : 'none'}${reference ? `, ${reference.label}` : ''}. Use arrow keys to browse.`}
        tabIndex={0}
        {...handlers}
      >
        {ticks.map((t) => (
          <g key={t}>
            <line x1={left} x2={width - PAD.r} y1={py(t)} y2={py(t)} className="gl" />
            <text x={left - 8} y={py(t) + 4} textAnchor="end" className="tick">{fmtTick(t)}</text>
          </g>
        ))}
        {data.map((d, i) =>
          i % step === 0 || i === n - 1 ? (
            <text key={i} x={cx(i)} y={H - 6} textAnchor="middle" className="tick">{d.label}</text>
          ) : null,
        )}
        {data.map((d, i) =>
          d.value > 0 ? (
            <path
              key={i}
              d={barPath(cx(i) - barW / 2, d.value)}
              className="bar-mark"
              style={{ opacity: active === null || active === i ? 1 : 0.55 }}
            />
          ) : null,
        )}
        {reference && (
          <g>
            <line x1={left} x2={width - PAD.r} y1={py(reference.value)} y2={py(reference.value)} className="ref-line" />
            <text x={width - PAD.r} y={py(reference.value) - 6} textAnchor="end" className="ref-label">{reference.label}</text>
          </g>
        )}
        {/* with a target line, the tooltip carries the values instead of a label that could collide with it */}
        {active === null && !reference && maxIdx >= 0 && (
          <text x={Math.min(Math.max(cx(maxIdx), left + 20), width - PAD.r - 20)} y={py(max) - 6} textAnchor="middle" className="endlabel">
            {format(max)}
          </text>
        )}
      </svg>
      {active !== null && (
        <Tip x={cx(active)} y={py(data[active].value)} width={width} value={format(data[active].value)} caption={data[active].caption} />
      )}
    </div>
  );
}

/* --------------------------------------------------------------- Donut */

export interface Slice { label: string; value: number; color: string } // color = any CSS colour / var()

/** A ring split into parts. The legend beside it lists every value, so nothing depends on hover or colour alone. */
export function Donut({ slices, centerLabel, format = (n) => String(n) }: { slices: Slice[]; centerLabel: string; format?: (n: number) => string }) {
  const [active, setActive] = useState<number | null>(null);
  const total = slices.reduce((sum, x) => sum + x.value, 0);
  const size = 132;
  const stroke = 16;
  const r = (size - stroke) / 2;
  const C = 2 * Math.PI * r;
  const visible = slices.filter((x) => x.value > 0).length;
  const gap = visible > 1 ? 2.5 : 0; // a sliver of background between neighbours instead of an outline
  let offset = 0;

  return (
    <div className="donut-wrap">
      <div className="donut" onPointerLeave={() => setActive(null)}>
        <svg width={size} height={size} role="img" aria-label={`${centerLabel}: ${slices.map((x) => `${x.label} ${format(x.value)}`).join(', ')}`}>
          <circle className="donut-track" cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} />
          <g transform={`rotate(-90 ${size / 2} ${size / 2})`}>
            {total > 0 &&
              slices.map((x, i) => {
                if (x.value <= 0) return null;
                const len = (x.value / total) * C;
                const seg = Math.max(0, len - gap);
                const el = (
                  <circle
                    key={x.label}
                    className="donut-seg"
                    cx={size / 2}
                    cy={size / 2}
                    r={r}
                    fill="none"
                    style={{ stroke: x.color }}
                    strokeWidth={active === i ? stroke + 4 : stroke}
                    strokeDasharray={`${seg} ${C - seg}`}
                    strokeDashoffset={-offset}
                    onPointerEnter={() => setActive(i)}
                  />
                );
                offset += len;
                return el;
              })}
          </g>
        </svg>
        <div className="donut-center">
          <strong>{format(active !== null ? slices[active].value : total)}</strong>
          <span>{active !== null ? slices[active].label : centerLabel}</span>
        </div>
      </div>
      <ul className="legend-list">
        {slices.map((x) => (
          <li key={x.label}>
            <i className="swatch" style={{ background: x.color }} />
            <span className="lg-label">{x.label}</span>
            <strong>{format(x.value)}</strong>
            <span className="muted lg-pct">{total > 0 ? `${Math.round((x.value / total) * 100)}%` : '–'}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* --------------------------------------------------------- Horizontal bars */

export interface HBarItem { label: string; value: number; color?: string }

/** Labelled rows with a bar behind each value: good for "top categories" style lists. */
export function HBars({ items, format }: { items: HBarItem[]; format: (n: number) => string }) {
  const max = Math.max(...items.map((i) => i.value), 0) || 1;
  return (
    <ul className="hbars">
      {items.map((i) => (
        <li key={i.label}>
          <span className="hb-label">{i.label}</span>
          <span className="hb-track"><span className="hb-fill" style={{ width: `${(i.value / max) * 100}%`, background: i.color }} /></span>
          <span className="hb-value">{format(i.value)}</span>
        </li>
      ))}
    </ul>
  );
}
