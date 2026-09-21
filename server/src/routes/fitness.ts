import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { prisma } from '../db.js';
import { notFound } from '../http.js';

const workoutSchema = z.object({
  date: z.coerce.date(),
  title: z.string().min(1).max(100),
  durationMin: z.number().int().positive().nullish(),
  notes: z.string().max(1000).nullish(),
  exercises: z
    .array(
      z.object({
        name: z.string().min(1).max(100),
        sets: z.number().int().positive(),
        reps: z.number().int().positive(),
        weightKg: z.number().nonnegative().nullish(),
      }),
    )
    .default([]),
});

const runSchema = z.object({
  date: z.coerce.date(),
  rounds: z.number().positive().max(1000),
  durationMin: z.number().positive(),
  notes: z.string().max(1000).nullish(),
});

const metricSchema = z.object({
  date: z.coerce.date(),
  weightKg: z.number().positive(),
  notes: z.string().max(500).nullish(),
});

type Req = { params: unknown; user: { uid: number } };
const owned = (req: Req) => ({ id: Number((req.params as { id: string }).id), userId: req.user.uid });

export const fitnessRoutes: FastifyPluginAsync = async (app) => {
  // ----- gym workouts -----
  app.get('/workouts', async (req) =>
    prisma.workout.findMany({
      where: { userId: req.user.uid },
      include: { exercises: true },
      orderBy: { date: 'desc' },
      take: 100,
    }),
  );

  app.post('/workouts', async (req, reply) => {
    const { exercises, ...data } = workoutSchema.parse(req.body);
    const created = await prisma.workout.create({
      data: { ...data, userId: req.user.uid, exercises: { create: exercises } },
      include: { exercises: true },
    });
    return reply.status(201).send(created);
  });

  // Replaces the workout's fields and its whole exercise list.
  app.put('/workouts/:id', async (req) => {
    const { exercises, ...data } = workoutSchema.parse(req.body);
    const found = await prisma.workout.findFirst({ where: owned(req), select: { id: true } });
    if (!found) throw notFound();
    return prisma.$transaction(async (tx) => {
      await tx.workoutExercise.deleteMany({ where: { workoutId: found.id } });
      return tx.workout.update({
        where: { id: found.id },
        data: { ...data, exercises: { create: exercises } },
        include: { exercises: true },
      });
    });
  });

  app.delete('/workouts/:id', async (req, reply) => {
    const { count } = await prisma.workout.deleteMany({ where: owned(req) });
    if (!count) throw notFound();
    return reply.status(204).send();
  });

  // ----- rounds (the "Rounds" tab; stored in the Run table) -----
  app.get('/runs', async (req) =>
    prisma.run.findMany({ where: { userId: req.user.uid }, orderBy: { date: 'desc' }, take: 100 }),
  );

  app.post('/runs', async (req, reply) =>
    reply.status(201).send(await prisma.run.create({ data: { ...runSchema.parse(req.body), userId: req.user.uid } })),
  );

  app.put('/runs/:id', async (req) => {
    const { count } = await prisma.run.updateMany({ where: owned(req), data: runSchema.parse(req.body) });
    if (!count) throw notFound();
    return prisma.run.findFirst({ where: owned(req) });
  });

  app.delete('/runs/:id', async (req, reply) => {
    const { count } = await prisma.run.deleteMany({ where: owned(req) });
    if (!count) throw notFound();
    return reply.status(204).send();
  });

  // ----- body weight -----
  app.get('/body', async (req) =>
    prisma.bodyMetric.findMany({ where: { userId: req.user.uid }, orderBy: { date: 'desc' }, take: 100 }),
  );

  app.post('/body', async (req, reply) =>
    reply
      .status(201)
      .send(await prisma.bodyMetric.create({ data: { ...metricSchema.parse(req.body), userId: req.user.uid } })),
  );

  app.put('/body/:id', async (req) => {
    const { count } = await prisma.bodyMetric.updateMany({ where: owned(req), data: metricSchema.parse(req.body) });
    if (!count) throw notFound();
    return prisma.bodyMetric.findFirst({ where: owned(req) });
  });

  app.delete('/body/:id', async (req, reply) => {
    const { count } = await prisma.bodyMetric.deleteMany({ where: owned(req) });
    if (!count) throw notFound();
    return reply.status(204).send();
  });
};
