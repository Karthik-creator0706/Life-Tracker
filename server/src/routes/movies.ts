import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { prisma } from '../db.js';
import { httpError, notFound, parseDay } from '../http.js';
import { startOfToday } from './challenges.js';

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a YYYY-MM-DD date');

const movieSchema = z.object({
  title: z.string().trim().min(1, 'What is it called?').max(200),
  kind: z.enum(['MOVIE', 'SERIES']).default('MOVIE'),
  status: z.enum(['WATCHING', 'WATCHED', 'WANT']),
  reaction: z.enum(['LOVED', 'OKAY', 'HATED']).nullish(),
  favorite: z.boolean().default(false),
  rating: z.number().int().min(1).max(5).nullish(),
  platform: z.string().trim().max(60).nullish(),
  review: z.string().trim().max(5000).nullish(),
  watchedOn: day.nullish(),
});
type MovieInput = z.infer<typeof movieSchema>;

// Quick changes from the list: heart it, react to it, or move it along (want -> watching -> watched).
const patchSchema = z
  .object({
    favorite: z.boolean(),
    reaction: z.enum(['LOVED', 'OKAY', 'HATED']).nullable(),
    status: z.enum(['WATCHING', 'WATCHED', 'WANT']),
  })
  .partial()
  .refine((p) => Object.keys(p).length > 0, { message: 'Nothing to change' });

/** Keeps the stored row consistent no matter what the client sent. */
function normalize(b: MovieInput) {
  const watched = b.status === 'WATCHED';
  return {
    title: b.title,
    kind: b.kind,
    status: b.status,
    reaction: b.status === 'WANT' ? null : (b.reaction ?? null), // you can only love or hate what you have started
    favorite: b.favorite,
    rating: watched ? (b.rating ?? null) : null,
    platform: b.platform || null,
    review: b.review || null,
    watchedOn: watched ? (b.watchedOn ? parseDay(b.watchedOn) : new Date(startOfToday())) : null,
  };
}

export const movieRoutes: FastifyPluginAsync = async (app) => {
  app.get('/', async (req) => prisma.movie.findMany({ where: { userId: req.user.uid }, orderBy: { updatedAt: 'desc' }, take: 1000 }));

  app.post('/', async (req, reply) =>
    reply.status(201).send(await prisma.movie.create({ data: { ...normalize(movieSchema.parse(req.body)), userId: req.user.uid } })),
  );

  app.put<{ Params: { id: string } }>('/:id', async (req) => {
    const where = { id: Number(req.params.id), userId: req.user.uid };
    const { count } = await prisma.movie.updateMany({ where, data: normalize(movieSchema.parse(req.body)) });
    if (!count) throw notFound();
    return prisma.movie.findFirst({ where });
  });

  app.patch<{ Params: { id: string } }>('/:id', async (req) => {
    const where = { id: Number(req.params.id), userId: req.user.uid };
    const patch = patchSchema.parse(req.body);
    const cur = await prisma.movie.findFirst({ where });
    if (!cur) throw notFound();
    const next = normalize(
      movieSchema.parse({
        title: cur.title,
        kind: cur.kind,
        favorite: cur.favorite,
        status: cur.status,
        reaction: cur.reaction,
        rating: cur.rating,
        platform: cur.platform,
        review: cur.review,
        watchedOn: cur.watchedOn?.toISOString().slice(0, 10),
        ...patch,
      }),
    );
    if (patch.reaction && next.reaction === null) throw httpError(400, 'Start watching it before you rate how you felt');
    await prisma.movie.updateMany({ where, data: next });
    return prisma.movie.findFirst({ where });
  });

  app.delete<{ Params: { id: string } }>('/:id', async (req, reply) => {
    const { count } = await prisma.movie.deleteMany({ where: { id: Number(req.params.id), userId: req.user.uid } });
    if (!count) throw notFound();
    return reply.status(204).send();
  });
};
