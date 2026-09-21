import type { Running } from './runningLogic';

/** What GET /api/dashboard returns. */
export interface Dash {
  openTodos: number;
  money: { income: number; expense: number; balance: number };
  fitness: { workoutsThisWeek: number; roundsThisMonth: number; latestWeightKg: number | null };
  diary: { wroteToday: boolean; streak: number; total: number };
  running?: Running;
  challenges: { id: number; title: string; completedDays: number; targetDays: number; streak: number }[];
}
