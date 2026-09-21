import 'dotenv/config';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import rateLimit from '@fastify/rate-limit';
import { ZodError } from 'zod';
import { authRoutes } from './routes/auth.js';
import { todoRoutes } from './routes/todos.js';
import { transactionRoutes } from './routes/transactions.js';
import { fitnessRoutes } from './routes/fitness.js';
import { challengeRoutes } from './routes/challenges.js';
import { dashboardRoutes } from './routes/dashboard.js';
import { diaryRoutes } from './routes/diary.js';
import { foodRoutes } from './routes/food.js';
import { bookRoutes } from './routes/books.js';
import { insightRoutes } from './routes/insights.js';
import { careerRoutes } from './routes/career.js';
import { characterRoutes } from './routes/character.js';
import { templeRoutes } from './routes/temple.js';
import { screenRoutes } from './routes/screen.js';
import { movieRoutes } from './routes/movies.js';

const secret = process.env.JWT_SECRET;
if (!secret || secret.length < 32 || secret === 'change-me') {
  console.error('JWT_SECRET is missing or too short. Set a long random value in server/.env');
  process.exit(1);
}

// Behind a host's proxy (Render etc.) the real client address is in X-Forwarded-For; the rate limiter needs it.
const app = Fastify({ logger: { level: 'info' }, trustProxy: process.env.TRUST_PROXY === 'true' });

await app.register(cors, { origin: true });
await app.register(jwt, { secret });
await app.register(rateLimit, { global: false });

app.setErrorHandler((err: Error & { statusCode?: number; code?: string }, _req, reply) => {
  if (err instanceof ZodError) {
    return reply.status(400).send({ error: 'Invalid input', issues: err.issues });
  }
  if (err.code === 'P2025') {
    return reply.status(404).send({ error: 'Not found' });
  }
  if (err.statusCode && err.statusCode < 500) {
    return reply.status(err.statusCode).send({ error: err.message });
  }
  app.log.error(err);
  return reply.status(500).send({ error: 'Something went wrong' });
});

app.get('/api/health', async () => ({ ok: true }));

await app.register(authRoutes, { prefix: '/api/auth' });

// Everything below requires a valid login token.
await app.register(async (protectedApp) => {
  protectedApp.addHook('onRequest', async (req, reply) => {
    try {
      await req.jwtVerify();
    } catch {
      return reply.status(401).send({ error: 'Unauthorized' });
    }
  });

  await protectedApp.register(todoRoutes, { prefix: '/api/todos' });
  await protectedApp.register(transactionRoutes, { prefix: '/api/transactions' });
  await protectedApp.register(fitnessRoutes, { prefix: '/api/fitness' });
  await protectedApp.register(challengeRoutes, { prefix: '/api/challenges' });
  await protectedApp.register(dashboardRoutes, { prefix: '/api/dashboard' });
  await protectedApp.register(diaryRoutes, { prefix: '/api/diary' });
  await protectedApp.register(foodRoutes, { prefix: '/api/food' });
  await protectedApp.register(bookRoutes, { prefix: '/api/books' });
  await protectedApp.register(insightRoutes, { prefix: '/api/insights' });
  await protectedApp.register(careerRoutes, { prefix: '/api/career' });
  await protectedApp.register(characterRoutes, { prefix: '/api/character' });
  await protectedApp.register(templeRoutes, { prefix: '/api/temple' });
  await protectedApp.register(screenRoutes, { prefix: '/api/screen' });
  await protectedApp.register(movieRoutes, { prefix: '/api/movies' });
});

// In production one service does it all: the API above and the built app (client/dist) below.
// In development Vite serves the app, so this is skipped when client/dist has not been built.
const clientDist = fileURLToPath(new URL('../../client/dist', import.meta.url));
if (existsSync(clientDist)) {
  await app.register(fastifyStatic, {
    root: clientDist,
    wildcard: false,
    index: ['index.html'],
    cacheControl: false,
    // built files in /assets have a hash in their name, so they never change; everything else is re-checked on each visit
    setHeaders: (res, path) => res.setHeader('Cache-Control', path.replaceAll('\\', '/').includes('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache'),
  });
  app.setNotFoundHandler((req, reply) => {
    if (req.method !== 'GET' || req.url.startsWith('/api/')) return reply.status(404).send({ error: 'Not found' });
    // any other address is a page of the single-page app (e.g. /career refreshed): hand back index.html, never cached
    return reply.sendFile('index.html');
  });
}

const port = Number(process.env.PORT ?? 4000);
await app.listen({ port, host: '0.0.0.0' });
