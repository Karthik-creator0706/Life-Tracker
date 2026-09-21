/** Throw from a route to send a 4xx response (handled in the global error handler). */
export const httpError = (statusCode: number, message: string) =>
  Object.assign(new Error(message), { statusCode });

export const notFound = () => httpError(404, 'Not found');

/** "YYYY-MM-DD" -> UTC-midnight Date (the app stores every calendar day this way). */
export function parseDay(value: string): Date {
  const d = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(value) : new Date(NaN);
  if (Number.isNaN(d.getTime())) throw httpError(400, 'Invalid date');
  return d;
}

