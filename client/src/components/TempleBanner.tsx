import { Link, useLocation } from 'react-router-dom';
import { useTemple } from '../temple';
import { sinceText } from '../templeLogic';

/** Shown on every page from the reminder time until you log today's temple visit. */
export default function TempleBanner() {
  const { showBanner, stats, dismissToday, markVisited } = useTemple();
  const onTemple = useLocation().pathname === '/temple';

  if (!showBanner) return null;

  const days = stats?.totalDays ?? 0;
  const detail = days === 0
    ? 'Log your first visit and start counting the days.'
    : `You have been ${days} ${days === 1 ? 'day' : 'days'} so far${stats?.streak && stats.streak > 1 ? ` · 🔥 ${stats.streak}-day streak` : ` · ${sinceText(stats?.daysSinceLast ?? null).toLowerCase()}`}.`;

  return (
    <div className="alert-banner temple" role="alert">
      <div className="alert-head">
        <span className="alert-icon" aria-hidden>🛕</span>
        <strong>Time for the temple today</strong>
        <div className="alert-actions">
          {stats?.lastTemple && (
            <button type="button" className="ghost" onClick={markVisited} title={`Log a visit to ${stats.lastTemple}`}>
              I went ✓
            </button>
          )}
          {!onTemple && <Link to="/temple" className="alert-link">{stats?.lastTemple ? 'Open' : 'Log a visit'}</Link>}
          <button type="button" className="ghost" onClick={dismissToday} title="Hide this for today">Not today</button>
        </div>
      </div>
      <div className="muted" style={{ marginTop: 6 }}>{detail}</div>
    </div>
  );
}
