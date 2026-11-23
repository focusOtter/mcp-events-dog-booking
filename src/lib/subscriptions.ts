import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { db } from './db';
import { filterSchema } from './domain';
import { postCallback, validateCallback } from './callback';
import { decodeSecret, signedHeaders, subscriptionId } from './signatures';

export class RpcError extends Error {
  constructor(public code: number, message: string, public data?: Record<string, unknown>) { super(message); }
}

const identitySchema = z.object({
  name: z.enum(['appointment.booked', 'appointment.cancelled']),
  arguments: filterSchema.default({}),
  delivery: z.object({ mode: z.literal('webhook'), url: z.string() }),
});
const subscribeSchema = identitySchema.extend({
  delivery: z.object({ mode: z.literal('webhook'), url: z.string(), secret: z.string() }),
  ttlMs: z.number().int().positive().max(Number.MAX_SAFE_INTEGER).nullable().optional(),
  cursor: z.string().nullable().optional(), maxAgeMs: z.number().int().nonnegative().optional(),
});

export async function subscribeEvent(params: unknown) {
  const input = subscribeSchema.parse(params);
  try { validateCallback(input.delivery.url); decodeSecret(input.delivery.secret); }
  catch { throw new RpcError(-32602, 'Invalid callback URL or webhook secret'); }
  if (input.maxAgeMs != null && input.maxAgeMs !== 0) {
    throw new RpcError(-32026, 'This demo supports live events only', { feature: 'replay' });
  }
  const id = subscriptionId(input.delivery.url, input.name, input.arguments);
  const challenge = randomUUID();
  const body = JSON.stringify({ type: 'verification', challenge });
  try {
    const response = await postCallback(input.delivery.url,
      signedHeaders(input.delivery.secret, randomUUID(), body, id), body);
    if (response.status < 200 || response.status >= 300 || JSON.parse(response.body).challenge !== challenge) {
      throw new Error('Challenge failed');
    }
  } catch {
    throw new RpcError(-32027, 'CallbackEndpointError', { reason: 'challenge_failed' });
  }
  const ttlMs = input.ttlMs === null ? 86400000 : input.ttlMs ?? 3600000;
  const refreshBefore = new Date(Date.now() + Math.min(ttlMs, 86400000)).toISOString();
  const sql = db();
  const [, inserted] = await sql.transaction([
    sql`LOCK TABLE subscriptions IN SHARE ROW EXCLUSIVE MODE`,
    sql`INSERT INTO subscriptions(id, url, name, arguments, secret, refresh_before, active)
      SELECT ${id}, ${input.delivery.url}, ${input.name}, ${JSON.stringify(input.arguments)}::jsonb, ${input.delivery.secret}, ${refreshBefore}, true
      WHERE (SELECT count(*) FROM subscriptions WHERE active AND (refresh_before IS NULL OR refresh_before > now())) < 25
        OR EXISTS (SELECT 1 FROM subscriptions WHERE id = ${id} AND active AND (refresh_before IS NULL OR refresh_before > now()))
      ON CONFLICT(id) DO UPDATE SET secret = EXCLUDED.secret, refresh_before = EXCLUDED.refresh_before, active = true
      RETURNING id`,
  ]);
  if (!inserted.length) throw new RpcError(-32000, 'Active subscription limit reached (25); unsubscribe or wait for expiry');
  const [latest] = await sql`SELECT COALESCE(max(sequence), 0)::text AS cursor FROM events`;
  return { id, refreshBefore, cursor: input.cursor ?? latest.cursor as string, truncated: false };
}

export async function unsubscribeEvent(params: unknown) {
  const input = identitySchema.parse(params);
  const id = subscriptionId(input.delivery.url, input.name, input.arguments);
  await db()`DELETE FROM subscriptions WHERE id = ${id}`;
  return {};
}
