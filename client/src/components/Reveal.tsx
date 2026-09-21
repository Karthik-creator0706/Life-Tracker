import { ReactNode, useEffect, useRef, useState } from 'react';

/**
 * Mounts its children only once they scroll into view, so charts play their draw-in animation when you
 * actually see them (not while they're still off-screen). Falls back to showing immediately where
 * IntersectionObserver doesn't exist.
 */
export default function Reveal({ children, className = '', minHeight = 200 }: { children: ReactNode; className?: string; minHeight?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(() => typeof IntersectionObserver === 'undefined');

  useEffect(() => {
    if (shown) return;
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setShown(true);
          io.disconnect();
        }
      },
      { rootMargin: '0px 0px -6% 0px', threshold: 0.05 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [shown]);

  return (
    <div ref={ref} className={`reveal ${className}`} style={shown ? undefined : { minHeight }}>
      {shown ? children : null}
    </div>
  );
}
