import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, getToken, setToken } from './api';

export interface User { id: number; name: string; username: string; phone: string | null; avatar: string | null }
export interface ProfileUpdate { name: string; phone: string | null; avatar: string | null }
interface Session { token: string; user: User }

interface AuthState {
  user: User | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<void>;
  register: (name: string, username: string, password: string) => Promise<void>;
  logout: () => void;
  updateProfile: (p: ProfileUpdate) => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(() => !!getToken());

  // Restore the session on page load.
  useEffect(() => {
    if (!getToken()) return;
    api<User>('/auth/me')
      .then(setUser)
      .catch(() => setToken(null))
      .finally(() => setLoading(false));
  }, []);

  // api() fires this when the server rejects our token (expired / invalid).
  useEffect(() => {
    const onLogout = () => setUser(null);
    window.addEventListener('auth:logout', onLogout);
    return () => window.removeEventListener('auth:logout', onLogout);
  }, []);

  const start = useCallback((s: Session) => {
    setToken(s.token);
    setUser(s.user);
  }, []);

  const value = useMemo<AuthState>(
    () => ({
      user,
      loading,
      login: async (username, password) => start(await api<Session>('/auth/login', 'POST', { username, password })),
      register: async (name, username, password) =>
        start(await api<Session>('/auth/register', 'POST', { name: name || undefined, username, password })),
      updateProfile: async (p) => setUser(await api<User>('/auth/profile', 'PUT', p)),
      logout: () => {
        setToken(null);
        setUser(null);
      },
    }),
    [user, loading, start],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
