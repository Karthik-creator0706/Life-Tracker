import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, notify } from './api';
import { useAuth } from './auth';
import { AlertTodo, buildMessage, classify, shouldNotify } from './alertLogic';

export interface AlertSettings { enabled: boolean; intervalMin: number; startHour: number; endHour: number }
export type Permission = NotificationPermission | 'unsupported';

interface AlertsState {
  overdue: AlertTodo[];
  dueToday: AlertTodo[];
  count: number;
  snoozed: boolean;
  snoozeUntil: number;
  snooze: (minutes: number) => void;
  unsnooze: () => void;
  settings: AlertSettings;
  setSettings: (patch: Partial<AlertSettings>) => void;
  permission: Permission;
  enable: () => Promise<void>;
  sendTest: () => void;
}

const DEFAULTS: AlertSettings = { enabled: false, intervalMin: 30, startHour: 8, endHour: 22 };
const SETTINGS_KEY = 'lt_alert_settings';
const LAST_KEY = 'lt_alert_last';
const SNOOZE_KEY = 'lt_alert_snooze';

// localStorage can throw (private windows, blocked storage): every access is guarded.
export const read = (key: string): string | null => { try { return localStorage.getItem(key); } catch { return null; } };
export const write = (key: string, value: string) => { try { localStorage.setItem(key, value); } catch { /* ignore */ } };

const loadSettings = (): AlertSettings => {
  try { return { ...DEFAULTS, ...JSON.parse(read(SETTINGS_KEY) ?? '{}') }; } catch { return DEFAULTS; }
};

// Notifications only work on https:// or localhost, and only in browsers that have the API.
export const readPermission = (): Permission =>
  typeof Notification === 'undefined' || !window.isSecureContext ? 'unsupported' : Notification.permission;

const AlertsContext = createContext<AlertsState | null>(null);

export function AlertsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const navigateRef = useRef(navigate);
  navigateRef.current = navigate;

  const [todos, setTodos] = useState<AlertTodo[]>([]);
  const [now, setNow] = useState(() => Date.now());
  const [settings, setSettingsState] = useState<AlertSettings>(loadSettings);
  const [snoozeUntil, setSnoozeUntil] = useState(() => Number(read(SNOOZE_KEY) ?? 0));
  const [permission, setPermission] = useState<Permission>(readPermission);

  const todayStr = new Date(now).toLocaleDateString('en-CA'); // local date, YYYY-MM-DD
  const { overdue, dueToday } = useMemo(() => classify(todos, todayStr), [todos, todayStr]);
  const count = overdue.length + dueToday.length;

  const refresh = useCallback(async () => {
    if (!user) return;
    try {
      setTodos(await api<AlertTodo[]>('/todos'));
    } catch {
      /* offline or server restarting: keep showing the last known list */
    }
  }, [user]);

  // Keep the list fresh: on login, every minute, when you come back to the tab, and when a to-do changes.
  useEffect(() => {
    if (!user) { setTodos([]); return; }
    refresh();
    const onBack = () => {
      if (document.visibilityState === 'visible') { refresh(); setPermission(readPermission()); setNow(Date.now()); }
    };
    const id = setInterval(refresh, 60_000);
    window.addEventListener('todos:changed', refresh);
    window.addEventListener('focus', onBack);
    document.addEventListener('visibilitychange', onBack);
    return () => {
      clearInterval(id);
      window.removeEventListener('todos:changed', refresh);
      window.removeEventListener('focus', onBack);
      document.removeEventListener('visibilitychange', onBack);
    };
  }, [user, refresh]);

  // The timer reads the latest values from a ref so it never needs restarting.
  const latest = useRef({ overdue, dueToday, settings, snoozeUntil });
  latest.current = { overdue, dueToday, settings, snoozeUntil };

  useEffect(() => {
    const id = setInterval(() => {
      const n = Date.now();
      setNow(n);
      const L = latest.current;
      const ok = shouldNotify({
        enabled: L.settings.enabled,
        permission: readPermission(),
        now: n,
        startHour: L.settings.startHour,
        endHour: L.settings.endHour,
        snoozeUntil: L.snoozeUntil,
        lastNotified: Number(read(LAST_KEY) ?? 0), // shared across tabs, so two tabs don't both nag
        intervalMin: L.settings.intervalMin,
        pending: L.overdue.length + L.dueToday.length,
      });
      if (!ok) return;
      write(LAST_KEY, String(n));
      const { title, body } = buildMessage(L.overdue, L.dueToday);
      try {
        const popup = new Notification(title, { body, tag: 'lt-todo', icon: '/icon-192.png', renotify: true } as NotificationOptions);
        popup.onclick = () => { window.focus(); navigateRef.current('/todos'); popup.close(); };
      } catch {
        /* some browsers refuse `new Notification` (e.g. Android Chrome); the in-app banner still works */
      }
    }, 30_000);
    return () => clearInterval(id);
  }, []);

  // A number in the tab title is an alert you can see from another tab.
  useEffect(() => {
    document.title = count > 0 && user ? `(${count}) Life Tracker` : 'Life Tracker';
  }, [count, user]);

  const setSettings = useCallback((patch: Partial<AlertSettings>) => {
    setSettingsState((s) => {
      const next = { ...s, ...patch };
      if (next.endHour <= next.startHour) {
        if ('startHour' in patch) next.endHour = Math.min(24, next.startHour + 1);
        else next.startHour = Math.max(0, next.endHour - 1);
      }
      write(SETTINGS_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const snooze = useCallback((minutes: number) => {
    const until = Date.now() + minutes * 60_000;
    write(SNOOZE_KEY, String(until));
    setSnoozeUntil(until);
    setNow(Date.now());
  }, []);

  const unsnooze = useCallback(() => {
    write(SNOOZE_KEY, '0');
    setSnoozeUntil(0);
  }, []);

  // Must be called from a click: browsers only show the permission prompt after a user gesture.
  const enable = useCallback(async () => {
    if (readPermission() === 'unsupported') {
      notify('Notifications need https:// or localhost in a supported browser', 'error');
      return;
    }
    const result = await Notification.requestPermission();
    setPermission(result);
    if (result === 'granted') {
      setSettings({ enabled: true });
      notify('Reminders on 🔔');
    } else {
      notify("Notifications are blocked — allow them in your browser's site settings", 'error');
    }
  }, [setSettings]);

  const sendTest = useCallback(() => {
    if (readPermission() !== 'granted') { notify('Turn reminders on first', 'error'); return; }
    try {
      new Notification('Life Tracker', { body: 'Reminders are working ✓', icon: '/icon-192.png' });
    } catch {
      notify("This browser wouldn't show the notification", 'error');
    }
  }, []);

  const value = useMemo<AlertsState>(
    () => ({
      overdue, dueToday, count,
      snoozed: now < snoozeUntil, snoozeUntil, snooze, unsnooze,
      settings, setSettings, permission, enable, sendTest,
    }),
    [overdue, dueToday, count, now, snoozeUntil, snooze, unsnooze, settings, setSettings, permission, enable, sendTest],
  );

  return <AlertsContext.Provider value={value}>{children}</AlertsContext.Provider>;
}

export function useAlerts() {
  const ctx = useContext(AlertsContext);
  if (!ctx) throw new Error('useAlerts must be used inside <AlertsProvider>');
  return ctx;
}
