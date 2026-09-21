import { useTemple } from '../temple';

const REPEATS = [0, 60, 120, 180];
const repeatLabel = (m: number) => (m === 0 ? "Don't repeat" : `Every ${m / 60} hour${m > 60 ? 's' : ''}`);

export default function TempleReminder() {
  const { settings, setSettings, permission, enablePopups, sendTest } = useTemple();
  const popupsOn = settings.enabled && settings.popups && permission === 'granted';

  return (
    <div className="card" id="reminders">
      <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'nowrap' }}>
        <h2 style={{ margin: 0 }}>🔔 Daily reminder</h2>
        <input
          type="checkbox"
          role="switch"
          className="switch"
          aria-label="Daily temple reminder"
          checked={settings.enabled}
          onChange={(e) => setSettings({ enabled: e.target.checked })}
        />
      </div>

      <p className="muted" style={{ margin: '8px 0 0' }}>
        Every day from the time you choose, a banner reminds you to go to the temple, until you log today's visit. It tells you how many days you have been so far.
      </p>

      {settings.enabled && (
        <div className="row" style={{ marginTop: 12 }}>
          <label className="field">
            Remind me at
            <input type="time" value={settings.time} onChange={(e) => e.target.value && setSettings({ time: e.target.value })} />
          </label>
          <label className="field">
            <select
              value={settings.repeatMin}
              disabled={!popupsOn}
              onChange={(e) => setSettings({ repeatMin: Number(e.target.value) })}
              aria-label="How often to repeat the popup"
            >
              {REPEATS.map((m) => <option key={m} value={m}>{repeatLabel(m)}</option>)}
            </select>
          </label>
        </div>
      )}

      {settings.enabled && (
        <div className="row" style={{ marginTop: 12, justifyContent: 'space-between', flexWrap: 'nowrap' }}>
          <div>
            <strong>Popup notification</strong>
            <div className="muted">A browser notification at that time, even from another tab.</div>
          </div>
          {permission !== 'unsupported' && (
            <input
              type="checkbox"
              role="switch"
              className="switch"
              aria-label="Browser popups"
              checked={popupsOn}
              disabled={permission === 'denied'}
              onChange={(e) => (e.target.checked ? enablePopups() : setSettings({ popups: false }))}
            />
          )}
        </div>
      )}

      {permission === 'unsupported' && (
        <p className="warn-note">
          Popups aren't available here — browsers only allow them on <code>localhost</code> or <code>https://</code> (so not on a
          phone over plain Wi-Fi). The banner above still appears every day.
        </p>
      )}
      {permission === 'denied' && (
        <p className="warn-note">
          Notifications are blocked for this site. Allow them in your browser's site settings (the 🔒 icon by the address), then turn popups on.
        </p>
      )}
      {popupsOn && (
        <div className="row" style={{ marginTop: 10 }}>
          <button type="button" onClick={sendTest}>Send a test</button>
          <span className="muted">Popups only appear while this app is open in a browser tab.</span>
        </div>
      )}
    </div>
  );
}
