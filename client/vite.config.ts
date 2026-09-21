import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Point the dev proxy at whatever PORT the API is configured to use in server/.env.
function apiPort(): number {
  try {
    const env = readFileSync(new URL('../server/.env', import.meta.url), 'utf8');
    const match = env.match(/^\s*PORT\s*=\s*"?(\d+)"?/m);
    if (match) return Number(match[1]);
  } catch {
    /* no .env yet: fall through to the default */
  }
  return 4000;
}

export default defineConfig({
  plugins: [react()],
  server: {
    host: true, // reachable from your phone on the same Wi-Fi
    port: 5173,
    proxy: { '/api': `http://localhost:${apiPort()}` },
  },
});
