import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, notify, templeChanged } from './api';
import { Permission, read, readPermission, write } from './alerts';
import { useAuth } from './auth';
import { buildMessage, reminderDue, shouldPopup, TempleSettings, TempleStats } from './templeLogic';

interface TempleState {
  stats: TempleStats | null;
  visitedToday: boolean;
  due: boolean; // the reminder time has passed and you have not been yet (drives the banner and the sidebar dot)
  showBanner: boolean; // due, and you have not pressed "Not today"
  dismissToday: () => void;
  markVisited: () => Promise<void>; // one tap: log today at the temple you went to last time
  settings: TempleSettings;
  setSettings: (patch: Partial<TempleSettings>) => void;
  permission: Permission;
  enablePopups: () => Promise<void>;
  sendTest: () => void;
}

const DEFAULTS: TempleSettings = { enabled: true, time: '06:00', repeatMin: 120, popups: false };
const SETTINGS_KEY = 'lt_temple_settings';
const LAST_KEY = 'lt_temple_last'; // when a popup was last sent (shared across tabs, so two tabs don't both nag)
const DISMISS_KEY = 'lt_temple_dismissed'; // the day you pressed "Not today"

const loadSettings = (): TempleSettings => {
  try { return { ...DEFAULTS, ...JSON.parse(read(SETTINGS_KEY) ?? '{}') }; } catch { return DEFAULTS; }
};
const localDay = (ms: number) => new Date(ms).toLocaleDateString('en-CA'); // local date, YYYY-MM-DD

const TempleContext = createContext<TempleState | null>(null);

export function TempleProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const navigateRef = useRef(navigate);
  navigateRef.current = navigate;

  const [stats, setStats] = useState<TempleStats | null>(null);
  const [statsDay, setStatsDay] = useState(''); // the day the stats were worked out for
  const [now, setNow] = useState(() => Date.now());
  const [settings, setSettingsState] = useState<TempleSettings>(loadSettings);
  const [dismissedDay, setDismissedDay] = useState(() => read(DISMISS_KEY) ?? '');
  const [permission, setPermission] = useState<Permission>(readPermission);

  const todayStr = localDay(now);

  const refresh = useCallback(async () => {
    if (!user) return;
    const day = localDay(Date.now());
    try {
      setStats(await api<TempleStats>(`/temple/stats?today=${day}`));
      setStatsDay(day);
    } catch {
      /* offline or server restarting: keep showing the last known numbers */
    }
  }, [user]);

  // Keep the numbers fresh: on login, after midnight, every 5 minutes, when you come back to the tab, and when a visit changes.
  useEffect(() => {
    if (!user) { setStats(null); return; }
    refresh();
    const onBack = () => {
      if (document.visibilityState === 'visible') { refresh(); setPermission(readPermission()); setNow(Date.now()); }
    };
    const id = setInterval(refresh, 300_000);
    window.addEventListener('temple:changed', refresh);
    window.addEventListener('focus', onBack);
    document.addEventListener('visibilitychange', onBack);
    return () => {
      clearInterval(id);
      window.removeEventListener('temple:changed', refresh);
      window.removeEventListener('focus', onBack);
      document.removeEventListener('visibilitychange', onBack);
    };
  }, [user, refresh, todayStr]);

  // Stats worked out for yesterday say nothing about today, so wait for the fresh ones after midnight.
  const visitedToday = !!stats?.visitedToday && statsDay === todayStr;
  const known = !!stats && statsDay === todayStr;
  const due = known && reminderDue(settings, now, visitedToday);
  const showBanner = due && dismissedDay !== todayStr;

  // The timer reads the latest values from a ref so it never needs restarting.
  const latest = useRef({ stats, settings, visitedToday, known });
  latest.current = { stats, settings, visitedToday, known };

  useEffect(() => {
    const id = setInterval(() => {
      const n = Date.now();
      setNow(n);
      const L = latest.current;
      if (!L.known) return; // no numbers for today yet: never nag on stale data
      const ok = shouldPopup({
        settings: L.settings,
        permission: readPermission(),
        now: n,
        visitedToday: L.visitedToday,
        lastNotified: Number(read(LAST_KEY) ?? 0),
      });
      if (!ok) return;
      write(LAST_KEY, String(n));
      const { title, body } = buildMessage(L.stats);
      try {
        const popup = new Notification(title, { body, tag: 'lt-temple', icon: '/icon-192.png', renotify: true } as NotificationOptions);
        popup.onclick = () => { window.focus(); navigateRef.current('/temple'); popup.close(); };
      } catch {
        /* some browsers refuse `new Notification` (e.g. Android Chrome); the in-app banner still works */
      }
    }, 30_000);
    return () => clearInterval(id);
  }, []);

  const setSettings = useCallback((patch: Partial<TempleSettings>) => {
    setSettingsState((s) => {
      const next = { ...s, ...patch };
      write(SETTINGS_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const dismissToday = useCallback(() => {
    const day = localDay(Date.now());
    write(DISMISS_KEY, day);
    setDismissedDay(day);
  }, []);

  const markVisited = useCallback(async () => {
    const temple = latest.current.stats?.lastTemple;
    if (!temple) { navigateRef.current('/temple'); return; } // first time: it needs a temple name
    const day = localDay(Date.now());
    try {
      await api(`/temple?today=${day}`, 'POST', { date: day, temple });
      notify('Visit logged 🙏');
    } catch (e) {
      // "already logged" just means the numbers were out of date: refresh them below
      if (!/already logged/i.test((e as Error).message)) return;
    }
    templeChanged();
  }, []);

  // Must be called from a click: browsers only show the permission prompt after a user gesture.
  const enablePopups = useCallback(async () => {
    if (readPermission() === 'unsupported') {
      notify('Notifications need https:// or localhost in a supported browser', 'error');
      return;
    }
    const result = await Notification.requestPermission();
    setPermission(result);
    if (result === 'granted') {
      setSettings({ popups: true, enabled: true });
      notify('Temple reminders on 🔔');
    } else {
      notify("Notifications are blocked — allow them in your browser's site settings", 'error');
    }
  }, [setSettings]);

  const sendTest = useCallback(() => {
    if (readPermission() !== 'granted') { notify('Turn popups on first', 'error'); return; }
    try {
      const { title, body } = buildMessage(latest.current.stats);
      new Notification(title, { body, icon: '/icon-192.png' });
    } catch {
      notify("This browser wouldn't show the notification", 'error');
    }
  }, []);

  const value = useMemo<TempleState>(
    () => ({ stats, visitedToday, due, showBanner, dismissToday, markVisited, settings, setSettings, permission, enablePopups, sendTest }),
    [stats, visitedToday, due, showBanner, dismissToday, markVisited, settings, setSettings, permission, enablePopups, sendTest],
  );

  return <TempleContext.Provider value={value}>{children}</TempleContext.Provider>;
}

export function useTemple() {
  const ctx = useContext(TempleContext);
  if (!ctx) throw new Error('useTemple must be used inside <TempleProvider>');
  return ctx;
}
