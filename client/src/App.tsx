import { CSSProperties, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Link, NavLink, Route, Routes, useLocation } from 'react-router-dom';
import { useAlerts } from './alerts';
import { useAuth } from './auth';
import { useTemple } from './temple';
import AlertBanner from './components/AlertBanner';
import Avatar from './components/Avatar';
import TempleBanner from './components/TempleBanner';
import ThemeToggle from './components/ThemeToggle';
import Dashboard from './pages/Dashboard';
import Todos from './pages/Todos';
import Money from './pages/Money';
import Fitness from './pages/Fitness';
import FoodLog from './pages/Food';
import Books from './pages/Books';
import Career from './pages/Career';
import Character from './pages/Character';
import Profile from './pages/Profile';
import Diary from './pages/Diary';
import Challenges from './pages/Challenges';
import Temple from './pages/Temple';
import Screen from './pages/Screen';
import Movies from './pages/Movies';
import Login from './pages/Login';

const links = [
  { to: '/', label: 'Home', icon: '🏠' },
  { to: '/todos', label: 'To-do', icon: '✅' },
  { to: '/money', label: 'Money', icon: '💰' },
  { to: '/fitness', label: 'Body', icon: '💪' },
  { to: '/food', label: 'Food', icon: '🍽️' },
  { to: '/books', label: 'Books', icon: '📚' },
  { to: '/career', label: 'Career', icon: '🎓' },
  { to: '/character', label: 'Character', icon: '🌟' },
  { to: '/diary', label: 'Diary', icon: '📔' },
  { to: '/challenges', label: 'Challenges', icon: '🔥' },
  { to: '/temple', label: 'Temple', icon: '🛕' },
  { to: '/screen', label: 'Screen', icon: '📱' },
  { to: '/movies', label: 'Movies', icon: '🎬' },
];

export default function App() {
  const { user, loading, logout } = useAuth();
  const location = useLocation();
  const { count: pendingTasks } = useAlerts();
  const { due: templeDue } = useTemple();

  useEffect(() => {
    document.querySelector('.nav a.active')?.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' });
  }, [location.pathname, user]);

  // A new page starts at the top instead of keeping the old scroll position.
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [location.pathname]);

  // The highlight in the nav glides to the current page (sidebar: a pill, phone: a bar over the tab).
  const navRef = useRef<HTMLElement>(null);
  const [pill, setPill] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const measurePill = useCallback(() => {
    const active = navRef.current?.querySelector<HTMLElement>('a.active');
    const next = active ? { x: active.offsetLeft, y: active.offsetTop, w: active.offsetWidth, h: active.offsetHeight } : null;
    setPill((cur) => (cur && next && cur.x === next.x && cur.y === next.y && cur.w === next.w && cur.h === next.h ? cur : next));
  }, []);
  useLayoutEffect(measurePill, [location.pathname, user, measurePill]);
  useEffect(() => {
    window.addEventListener('resize', measurePill);
    document.fonts?.ready.then(measurePill); // the web font changes text widths once it has loaded
    return () => window.removeEventListener('resize', measurePill);
  }, [measurePill]);

  // Anything that moves the links without a resize or a page change (a scrollbar appearing and wrapping the brand,
  // a badge, a late font) would leave the pill behind, so measure again whenever the nav or one of its parts changes size.
  useEffect(() => {
    const nav = navRef.current;
    if (!nav || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measurePill);
    ro.observe(nav);
    nav.querySelectorAll('a, .brand').forEach((el) => ro.observe(el));
    return () => ro.disconnect();
  }, [measurePill, user]);

  if (loading) return <div className="empty" style={{ paddingTop: 80 }}><span className="emoji">⏳</span>Loading…</div>;
  if (!user) return <Login />;

  return (
    <div className="shell">
      {/* Phone: slim top bar. Desktop: the same controls live at the bottom of the sidebar. */}
      <header className="topbar">
        <div className="brand">Life Tracker</div>
        <span className="dangle" aria-hidden />
        <div className="actions">
          <Link to="/profile" className="topbar-avatar" aria-label="Your profile"><Avatar avatar={user.avatar} name={user.name} size={32} /></Link>
          <ThemeToggle />
          <button className="logout" onClick={logout}>Log out</button>
        </div>
      </header>

      <nav className="nav" ref={navRef}>
        {pill && (
          <span
            className="nav-pill"
            aria-hidden
            style={{ '--x': `${pill.x}px`, '--y': `${pill.y}px`, '--w': `${pill.w}px`, '--h': `${pill.h}px` } as CSSProperties}
          />
        )}
        <span className="dangle" aria-hidden />
        <div className="brand"><span className="brand-icon">✨</span> Life Tracker</div>
        {links.map((l) => (
          <NavLink key={l.to} to={l.to} end={l.to === '/'} className={({ isActive }) => (isActive ? 'active' : '')}>
            <span className="icon">
              {l.icon}
              {l.to === '/todos' && pendingTasks > 0 && (
                <b className="nav-badge" key={pendingTasks} aria-label={`${pendingTasks} unfinished tasks need attention`}>{pendingTasks}</b>
              )}
              {l.to === '/temple' && templeDue && (
                <b className="nav-badge dot" aria-label="You have not been to the temple today" />
              )}
            </span>
            <span>{l.label}</span>
          </NavLink>
        ))}
        <div className="account">
          <Link to="/profile" className="who-link" title="Your profile">
            <Avatar avatar={user.avatar} name={user.name} size={38} />
            <div className="who">
              <div className="name" title={user.username}>{user.name}</div>
              <div className="muted">@{user.username}</div>
            </div>
          </Link>
          <div className="actions">
            <ThemeToggle />
            <button className="ghost" onClick={logout} aria-label="Log out" title="Log out">🚪</button>
          </div>
        </div>
      </nav>

      <main className="content">
        <AlertBanner />
        <TempleBanner />
        {/* keyed by route so the entrance animation replays on every page change */}
        <div className="page" key={location.pathname}>
          <Routes location={location}>
            <Route path="/" element={<Dashboard />} />
            <Route path="/todos" element={<Todos />} />
            <Route path="/money" element={<Money />} />
            <Route path="/fitness" element={<Fitness />} />
            <Route path="/food" element={<FoodLog />} />
            <Route path="/books" element={<Books />} />
            <Route path="/career" element={<Career />} />
            <Route path="/character" element={<Character />} />
            <Route path="/diary" element={<Diary />} />
            <Route path="/challenges" element={<Challenges />} />
            <Route path="/temple" element={<Temple />} />
            <Route path="/screen" element={<Screen />} />
            <Route path="/movies" element={<Movies />} />
            <Route path="/profile" element={<Profile />} />
          </Routes>
        </div>
      </main>
    </div>
  );
}
