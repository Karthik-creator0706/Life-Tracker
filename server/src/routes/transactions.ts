import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { prisma } from '../db.js';
import { notFound } from '../http.js';

const schema = z.object({
  type: z.enum(['INCOME', 'EXPENSE']),
  amount: z.number().positive(),
  category: z.string().min(1).max(60),
  note: z.string().max(500).nullish(),
  date: z.coerce.date(),
});

const monthRange = (month?: string) => {
  // month = "YYYY-MM"; defaults to the current month
  const now = new Date();
  const [y, m] = month ? month.split('-').map(Number) : [now.getUTCFullYear(), now.getUTCMonth() + 1];
  return { gte: new Date(Date.UTC(y, m - 1, 1)), lt: new Date(Date.UTC(y, m, 1)) };
};

const toJson = <T extends { amount: unknown }>(t: T) => ({ ...t, amount: Number(t.amount) });

export const transactionRoutes: FastifyPluginAsync = async (app) => {
  app.get<{ Querystring: { month?: string } }>('/', async (req) => {
    const rows = await prisma.transaction.findMany({
      where: { userId: req.user.uid, date: monthRange(req.query.month) },
      orderBy: [{ date: 'desc' }, { id: 'desc' }],
    });
    return rows.map(toJson);
  });

  app.get<{ Querystring: { month?: string } }>('/summary', async (req) => {
    const rows = await prisma.transaction.findMany({
      where: { userId: req.user.uid, date: monthRange(req.query.month) },
    });
    let income = 0;
    let expense = 0;
    const byCategory: Record<string, number> = {};
    for (const r of rows) {
      const amt = Number(r.amount);
      if (r.type === 'INCOME') income += amt;
      else {
        expense += amt;
        byCategory[r.category] = (byCategory[r.category] ?? 0) + amt;
      }
    }
    return { income, expense, balance: income - expense, byCategory };
  });

  app.post('/', async (req, reply) => {
    const data = schema.parse(req.body);
    return reply.status(201).send(toJson(await prisma.transaction.create({ data: { ...data, userId: req.user.uid } })));
  });

  app.put<{ Params: { id: string } }>('/:id', async (req) => {
    const data = schema.parse(req.body);
    const where = { id: Number(req.params.id), userId: req.user.uid };
    const { count } = await prisma.transaction.updateMany({ where, data });
    if (!count) throw notFound();
    return toJson((await prisma.transaction.findFirstOrThrow({ where })));
  });

  app.delete<{ Params: { id: string } }>('/:id', async (req, reply) => {
    const { count } = await prisma.transaction.deleteMany({ where: { id: Number(req.params.id), userId: req.user.uid } });
    if (!count) throw notFound();
    return reply.status(204).send();
  });
};
