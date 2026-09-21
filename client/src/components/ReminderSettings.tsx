import { useAlerts } from '../alerts';

const INTERVALS = [15, 30, 60, 120];
const HOURS = Array.from({ length: 24 }, (_, h) => h);
const hourLabel = (h: number) => `${String(h).padStart(2, '0')}:00`;

export default function ReminderSettings() {
  const { settings, setSettings, permission, enable, sendTest, snoozed, snoozeUntil, unsnooze } = useAlerts();
  const on = settings.enabled && permission === 'granted';

  return (
    <div className="card" id="reminders">
      <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'nowrap' }}>
        <h2 style={{ margin: 0 }}>🔔 Reminders</h2>
        {permission !== 'unsupported' && (
          <input
            type="checkbox"
            role="switch"
            className="switch"
            aria-label="Browser reminders"
            checked={on}
            disabled={permission === 'denied'}
            onChange={(e) => (e.target.checked ? enable() : setSettings({ enabled: false }))}
          />
        )}
      </div>

      <p className="muted" style={{ margin: '8px 0 0' }}>
        Get a notification every so often while a task that is <strong>overdue or due today</strong> is still unfinished.
        The banner above always shows them, even with this off.
      </p>

      {permission === 'unsupported' && (
        <p className="warn-note">
          Popups aren't available here — browsers only allow them on <code>localhost</code> or <code>https://</code> (so not on a
          phone over plain Wi-Fi). You'll still get the banner, the red count and the number in the tab title.
        </p>
      )}
      {permission === 'denied' && (
        <p className="warn-note">
          Notifications are blocked for this site. Allow them in your browser's site settings (the 🔒 icon by the address), then turn this on.
        </p>
      )}

      {on && (
        <div className="row" style={{ marginTop: 12 }}>
          <label className="field">
            Every
            <select value={settings.intervalMin} onChange={(e) => setSettings({ intervalMin: Number(e.target.value) })}>
              {INTERVALS.map((m) => <option key={m} value={m}>{m < 60 ? `${m} min` : `${m / 60} hour${m > 60 ? 's' : ''}`}</option>)}
            </select>
          </label>
          <label className="field">
            from
            <select value={settings.startHour} onChange={(e) => setSettings({ startHour: Number(e.target.value) })}>
              {HOURS.slice(0, 23).map((h) => <option key={h} value={h}>{hourLabel(h)}</option>)}
            </select>
          </label>
          <label className="field">
            to
            <select value={settings.endHour} onChange={(e) => setSettings({ endHour: Number(e.target.value) })}>
              {HOURS.slice(1).concat(24).map((h) => <option key={h} value={h}>{hourLabel(h % 24)}</option>)}
            </select>
          </label>
          <button type="button" onClick={sendTest}>Send a test</button>
        </div>
      )}

      {snoozed && (
        <div className="muted" style={{ marginTop: 10 }}>
          😴 Snoozed until {new Date(snoozeUntil).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} ·{' '}
          <button type="button" className="link ghost entry-more" onClick={unsnooze}>Resume now</button>
        </div>
      )}
      {on && (
        <div className="muted" style={{ marginTop: 10 }}>
          Notifications only appear while this app is open in a browser tab.
        </div>
      )}
    </div>
  );
}
