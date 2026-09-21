import { FormEvent, useEffect, useState } from 'react';
import { api } from '../api';
import { useAuth } from '../auth';

export default function Login() {
  const { login, register } = useAuth();
  const [signupOpen, setSignupOpen] = useState(false);
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<{ signupOpen: boolean }>('/auth/status')
      .then((s) => {
        setSignupOpen(s.signupOpen);
        // First run: nobody has an account yet, so go straight to creating one.
        if (s.signupOpen) setMode('register');
      })
      .catch(() => setError('Cannot reach the server — is it running?'));
  }, []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (mode === 'register') await register(name, username, password);
      else await login(username, password);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const isRegister = mode === 'register';

  return (
    <div className="auth-wrap">
      <form className="card auth-card" onSubmit={submit}>
        <div className="logo" aria-hidden>✓</div>
        <h1 style={{ marginBottom: 4 }}>Life Tracker</h1>
        <p className="muted" style={{ marginTop: 0 }}>
          {isRegister ? 'Create your account' : 'Sign in to continue'}
        </p>

        {isRegister && (
          <input placeholder="Your name (optional)" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} />
        )}
        <input
          placeholder="Username"
          autoComplete="username"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          required
        />
        <input
          type="password"
          placeholder={isRegister ? 'Password (min 4 characters)' : 'Password'}
          autoComplete={isRegister ? 'new-password' : 'current-password'}
          minLength={isRegister ? 4 : undefined}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />

        {error && <div className="error" style={{ margin: 0 }}>{error}</div>}

        <button className="primary" disabled={busy}>{busy ? 'Please wait…' : isRegister ? 'Create account' : 'Sign in'}</button>

        {signupOpen && (
          <button type="button" className="ghost link" onClick={() => { setError(null); setMode(isRegister ? 'login' : 'register'); }}>
            {isRegister ? 'Already have an account? Sign in' : 'New here? Create an account'}
          </button>
        )}
      </form>
    </div>
  );
}
