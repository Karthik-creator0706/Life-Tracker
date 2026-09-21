import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { prisma } from '../db.js';
import { notFound } from '../http.js';

const createSchema = z.object({
  title: z.string().min(1).max(200),
  notes: z.string().max(2000).nullish(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH']).default('MEDIUM'),
  dueDate: z.coerce.date().nullish(),
});

const updateSchema = createSchema.partial().extend({ done: z.boolean().optional() });

export const todoRoutes: FastifyPluginAsync = async (app) => {
  app.get('/', async (req) =>
    prisma.todo.findMany({
      where: { userId: req.user.uid },
      orderBy: [{ done: 'asc' }, { dueDate: { sort: 'asc', nulls: 'first' } }, { createdAt: 'desc' }], // undated tasks first, as before
    }),
  );

  app.post('/', async (req, reply) => {
    const data = createSchema.parse(req.body);
    return reply.status(201).send(await prisma.todo.create({ data: { ...data, userId: req.user.uid } }));
  });

  app.patch<{ Params: { id: string } }>('/:id', async (req) => {
    const { done, ...rest } = updateSchema.parse(req.body);
    const where = { id: Number(req.params.id), userId: req.user.uid };
    const { count } = await prisma.todo.updateMany({
      where,
      data: { ...rest, ...(done === undefined ? {} : { done, doneAt: done ? new Date() : null }) },
    });
    if (!count) throw notFound();
    return prisma.todo.findFirst({ where });
  });

  app.delete<{ Params: { id: string } }>('/:id', async (req, reply) => {
    const { count } = await prisma.todo.deleteMany({ where: { id: Number(req.params.id), userId: req.user.uid } });
    if (!count) throw notFound();
    return reply.status(204).send();
  });
};
