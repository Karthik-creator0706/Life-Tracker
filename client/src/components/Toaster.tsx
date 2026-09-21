import { useEffect, useState } from 'react';

interface Toast { id: number; message: string; type: 'success' | 'error' }

let nextId = 1;

/** Listens for `notify()` calls (see api.ts) and shows short-lived messages. */
export default function Toaster() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  useEffect(() => {
    const onToast = (e: Event) => {
      const { message, type } = (e as CustomEvent<Omit<Toast, 'id'>>).detail;
      const id = nextId++;
      setToasts((t) => [...t.slice(-2), { id, message, type }]);
      setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), type === 'error' ? 4500 : 2400);
    };
    window.addEventListener('app:toast', onToast);
    return () => window.removeEventListener('app:toast', onToast);
  }, []);

  return (
    <div className="toaster" role="status" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`toast ${t.type}`}>
          <span aria-hidden>{t.type === 'error' ? '⚠️' : '✓'}</span>
          {t.message}
        </div>
      ))}
    </div>
  );
}
