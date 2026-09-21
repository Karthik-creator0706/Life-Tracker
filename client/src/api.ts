import { useCallback, useEffect, useState } from 'react';

/** Backend API base URL */
const API_BASE_URL = import.meta.env.VITE_API_URL || '';

/** Show a toast from anywhere (rendered by <Toaster />). */
export const notify = (
  message: string,
  type: 'success' | 'error' = 'success'
) =>
  window.dispatchEvent(
    new CustomEvent('app:toast', {
      detail: { message, type },
    })
  );

const TOKEN_KEY = 'lt_token';

export const getToken = () => {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
};

export const setToken = (token: string | null) => {
  try {
    if (token) {
      localStorage.setItem(TOKEN_KEY, token);
    } else {
      localStorage.removeItem(TOKEN_KEY);
    }
  } catch {
    // Storage blocked
  }
};

export async function api<T = unknown>(
  path: string,
  method = 'GET',
  body?: unknown
): Promise<T> {
  const token = getToken();

  const headers: Record<string, string> = {};

  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const res = await fetch(`${API_BASE_URL}/api${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  // Expired or invalid session
  if (res.status === 401 && !path.startsWith('/auth/login')) {
    setToken(null);
    window.dispatchEvent(new Event('auth:logout'));
  }

  if (!res.ok) {
    const message =
      (await res.json().catch(() => null))?.error ??
      `Request failed (${res.status})`;

    // Failed saves/deletes should never be silent
    if (method !== 'GET' && res.status !== 401) {
      notify(message, 'error');
    }

    throw new Error(message);
  }

  return res.status === 204 ? (undefined as T) : res.json();
}

export function useApi<T>(path: string) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    try {
      setData(await api<T>(path));
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [path]);

  useEffect(() => {
    setLoading(true);
    reload();
  }, [reload]);

  return { data, error, loading, reload };
}

/** Local calendar date as YYYY-MM-DD. */
export const today = () => new Date().toLocaleDateString('en-CA');

export const thisMonth = () => today().slice(0, 7);

export const day = (iso: string) => iso.slice(0, 10);

export const money = (n: number) =>
  n.toLocaleString(undefined, {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  });

/** Tell the rest of the app that to-dos changed. */
export const todosChanged = () =>
  window.dispatchEvent(new Event('todos:changed'));

/** Tell the rest of the app that temple visits changed. */
export const templeChanged = () =>
  window.dispatchEvent(new Event('temple:changed'));