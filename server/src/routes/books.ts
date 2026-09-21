import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { prisma } from '../db.js';
import { notFound, parseDay } from '../http.js';
import { startOfToday } from './challenges.js';

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a YYYY-MM-DD date');

const bookSchema = z
  .object({
    title: z.string().trim().min(1, 'What is the book called?').max(200),
    author: z.string().trim().max(120).nullish(),
    status: z.enum(['READING', 'FINISHED', 'WANT']),
    totalPages: z.number().int().min(1).max(20000).nullish(),
    currentPage: z.number().int().min(0).max(20000).nullish(),
    rating: z.number().int().min(1).max(5).nullish(),
    moral: z.string().trim().max(5000).nullish(),
    startedOn: day.nullish(),
    finishedOn: day.nullish(),
  })
  .refine((b) => b.totalPages == null || b.currentPage == null || b.currentPage <= b.totalPages, {
    message: 'Current page is past the last page',
    path: ['currentPage'],
  });

/** Keeps the stored row consistent no matter what the client sent. */
function normalize(b: z.infer<typeof bookSchema>) {
  const finished = b.status === 'FINISHED';
  return {
    title: b.title,
    author: b.author || null,
    status: b.status,
    totalPages: b.totalPages ?? null,
    // a finished book is read to the end; a book you only want to read has no progress yet
    currentPage: finished ? (b.totalPages ?? b.currentPage ?? null) : b.status === 'WANT' ? null : (b.currentPage ?? null),
    rating: finished ? (b.rating ?? null) : null, // you can only rate it once you've read it
    moral: b.moral || null,
    startedOn: b.startedOn ? parseDay(b.startedOn) : null,
    finishedOn: finished ? (b.finishedOn ? parseDay(b.finishedOn) : new Date(startOfToday())) : null,
  };
}

export const bookRoutes: FastifyPluginAsync = async (app) => {
  // All your books; ?q= searches title, author and the moral.
  app.get<{ Querystring: { q?: string } }>('/', async (req) => {
    const userId = req.user.uid;
    const q = req.query.q?.trim();
    if (q) {
      // Plain substring match on lowercased text: case-insensitive, and % _  in the search are ordinary characters.
      const hits = await prisma.$queryRaw<{ id: number }[]>`
        SELECT id FROM "Book"
        WHERE "userId" = ${userId}
          AND (strpos(lower(title), lower(${q})) > 0
            OR strpos(lower(coalesce(author, '')), lower(${q})) > 0
            OR strpos(lower(coalesce(moral, '')), lower(${q})) > 0)
        ORDER BY "updatedAt" DESC LIMIT 500`;
      return prisma.book.findMany({ where: { userId, id: { in: hits.map((h) => h.id) } }, orderBy: { updatedAt: 'desc' } });
    }
    return prisma.book.findMany({ where: { userId }, orderBy: { updatedAt: 'desc' }, take: 500 });
  });

  app.post('/', async (req, reply) =>
    reply.status(201).send(await prisma.book.create({ data: { ...normalize(bookSchema.parse(req.body)), userId: req.user.uid } })),
  );

  app.put<{ Params: { id: string } }>('/:id', async (req) => {
    const where = { id: Number(req.params.id), userId: req.user.uid };
    const { count } = await prisma.book.updateMany({ where, data: normalize(bookSchema.parse(req.body)) });
    if (!count) throw notFound();
    return prisma.book.findFirst({ where });
  });

  app.delete<{ Params: { id: string } }>('/:id', async (req, reply) => {
    const { count } = await prisma.book.deleteMany({ where: { id: Number(req.params.id), userId: req.user.uid } });
    if (!count) throw notFound();
    return reply.status(204).send();
  });
};
