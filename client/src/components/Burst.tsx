const PIECES = 12;
const COLORS = ['#f59e0b', '#ef4444', '#10b981', '#6366f1', '#ec4899', '#0ea5e9'];

/** A one-shot confetti burst; mount it to play it, unmount it when done. Purely decorative. */
export default function Burst() {
  return (
    <span className="burst" aria-hidden>
      {Array.from({ length: PIECES }, (_, i) => (
        <i
          key={i}
          style={
            {
              '--angle': `${(360 / PIECES) * i}deg`,
              '--dist': `${38 + (i % 3) * 14}px`,
              background: COLORS[i % COLORS.length],
            } as React.CSSProperties
          }
        />
      ))}
    </span>
  );
}
