import type { FastifyPluginAsync } from 'fastify';
import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { z } from 'zod';
import { prisma } from '../db.js';
import { httpError } from '../http.js';

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: { uid: number };
    user: { uid: number };
  }
}

const scryptAsync = promisify(scrypt) as (pw: string, salt: Buffer, len: number) => Promise<Buffer>;

async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scryptAsync(password, salt, 64);
  return `${salt.toString('hex')}:${key.toString('hex')}`;
}

async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [saltHex, keyHex] = stored.split(':');
  const expected = Buffer.from(keyHex, 'hex');
  const actual = await scryptAsync(password, Buffer.from(saltHex, 'hex'), expected.length);
  return timingSafeEqual(actual, expected);
}

// Compared against when the username is unknown, so "no such user" and "wrong password" take the same time.
const dummyHash = await hashPassword('not-a-real-password');

const username = z
  .string()
  .trim()
  .toLowerCase()
  .min(2)
  .max(32)
  .regex(/^[a-z0-9._-]+$/, 'Username can only use letters, numbers, dot, dash and underscore');
const registerSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  username,
  password: z.string().min(4).max(200),
});
const loginSchema = z.object({ username, password: z.string().min(1).max(200) });

// ---- profile ----
// An optional phone number: digits with common separators, 7-15 digits, an optional leading +.
const phoneField = z
  .string()
  .trim()
  .max(24)
  .nullish()
  .transform((v) => (v ? v : null))
  .refine((v) => {
    if (v === null) return true;
    const digits = v.replace(/[^0-9]/g, '').length;
    return /^[+]?[0-9 ().-]+$/.test(v) && digits >= 7 && digits <= 15;
  }, 'Enter a valid phone number');

// A built-in avatar ("preset:<name>") or a small uploaded picture as a base64 data: URL (the browser shrinks it first).
const AVATAR_MAX = 250_000;
const avatarField = z
  .string()
  .max(AVATAR_MAX, 'That picture is too large')
  .nullish()
  .transform((v) => (v ? v : null))
  .refine((v) => v === null || /^preset:[a-z0-9-]{1,30}$/.test(v) || /^data:image[/](png|jpeg|webp);base64,[A-Za-z0-9+/]+=*$/.test(v), 'Unsupported picture');

const profileSchema = z.object({ name: z.string().trim().min(1, 'Your name cannot be empty').max(80), phone: phoneField, avatar: avatarField });

const signupAllowed = async () =>
  process.env.ALLOW_SIGNUP === 'true' || (await prisma.user.count()) === 0;

const limit = { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } };

export const authRoutes: FastifyPluginAsync = async (app) => {
  type U = { id: number; name: string; username: string; phone: string | null; avatar: string | null };
  const publicUser = (u: U) => ({ id: u.id, name: u.name, username: u.username, phone: u.phone, avatar: u.avatar });
  const session = (u: U) => ({
    token: app.jwt.sign({ uid: u.id }, { expiresIn: '30d' }),
    user: publicUser(u),
  });

  // Lets the login screen know whether to offer "Create account".
  app.get('/status', async () => ({ signupOpen: await signupAllowed() }));

  app.post('/register', limit, async (req, reply) => {
    if (!(await signupAllowed())) throw httpError(403, 'Sign-up is closed');
    const { name, username, password } = registerSchema.parse(req.body);
    if (await prisma.user.findUnique({ where: { username } })) throw httpError(409, 'That username is taken');
    const user = await prisma.user.create({
      data: { name: name || username, username, passwordHash: await hashPassword(password) },
    });
    return reply.status(201).send(session(user));
  });

  app.post('/login', limit, async (req) => {
    const { username, password } = loginSchema.parse(req.body);
    const user = await prisma.user.findUnique({ where: { username } });
    const ok = await verifyPassword(password, user?.passwordHash ?? dummyHash);
    if (!user || !ok) throw httpError(401, 'Invalid username or password');
    return session(user);
  });

  // These routes sit outside the protected block, so they check the token themselves.
  const authedUser = async (req: { jwtVerify: () => Promise<unknown>; user: { uid: number } }) => {
    await req.jwtVerify().catch(() => {
      throw httpError(401, 'Unauthorized');
    });
    const user = await prisma.user.findUnique({ where: { id: req.user.uid } });
    if (!user) throw httpError(401, 'Unauthorized');
    return user;
  };

  app.get('/me', async (req) => publicUser(await authedUser(req)));

  // Update your own name, phone number and picture.
  app.put('/profile', async (req) => {
    const me = await authedUser(req);
    const data = profileSchema.parse(req.body);
    return publicUser(await prisma.user.update({ where: { id: me.id }, data }));
  });
};
