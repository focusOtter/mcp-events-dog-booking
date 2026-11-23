import { db } from './db';
import { bookingSchema, cancelSchema, type Appointment, type GroomingEvent } from './domain';
import { postCallback } from './callback';
import { signedHeaders } from './signatures';

export async function listAppointments(): Promise<Appointment[]> {
  return await db()`SELECT id, dog_name AS "dogName", owner_name AS "ownerName", service,
    to_char(starts_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "startsAt", status
    FROM appointments WHERE status = 'booked' AND starts_at > now() ORDER BY starts_at` as Appointment[];
}

export async function deliverEvent(event: GroomingEvent) {
  const sql = db();
  const subscribers = await sql`SELECT id, url, secret FROM subscriptions WHERE active
    AND (refresh_before IS NULL OR refresh_before > now()) AND name = ${event.name}
    AND (NOT arguments ? 'service' OR arguments->>'service' = ${event.data.service})`;
  const body = JSON.stringify(event);
  await Promise.all(subscribers.map(async subscriber => {
    for (let attempt = 1; attempt <= 3; attempt++) {
      let status: number | null = null;
      let error: string | null = null;
      try {
        // AI SDK currently requires webhook-id == eventId, unlike independent per-message IDs.
        const response = await postCallback(subscriber.url, signedHeaders(subscriber.secret, event.eventId, body, subscriber.id), body);
        status = response.status;
      } catch { error = 'Callback connection failed'; }
      await sql`INSERT INTO deliveries(subscription_id, event_id, attempt, http_status, error)
        VALUES (${subscriber.id}, ${event.eventId}, ${attempt}, ${status}, ${error})`;
      if (status !== null && status >= 200 && status < 300) break;
      if (attempt < 3) await new Promise(resolve => setTimeout(resolve, attempt * 150));
    }
  }));
}

export async function bookAppointment(input: unknown) {
  const value = bookingSchema.parse(input);
  const rows = await db()`WITH changed AS (
    INSERT INTO appointments(dog_name, owner_name, service, starts_at)
    VALUES (${value.dogName}, ${value.ownerName}, ${value.service}, ${value.startsAt}) RETURNING *
  ), emitted AS (
    INSERT INTO events(name, data) SELECT 'appointment.booked', jsonb_build_object(
      'id', id, 'dogName', dog_name, 'ownerName', owner_name, 'service', service,
      'startsAt', to_char(starts_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'), 'status', status
    ) FROM changed RETURNING *
  ) SELECT event_id AS "eventId", name, data, sequence::text AS cursor,
    to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS timestamp FROM emitted`;
  const event = rows[0] as GroomingEvent;
  await deliverEvent(event);
  return event.data;
}

export async function cancelAppointment(input: unknown) {
  const { id } = cancelSchema.parse(input);
  const rows = await db()`WITH changed AS (
    UPDATE appointments SET status = 'cancelled' WHERE id = ${id} AND status = 'booked' RETURNING *
  ), emitted AS (
    INSERT INTO events(name, data) SELECT 'appointment.cancelled', jsonb_build_object(
      'id', id, 'dogName', dog_name, 'ownerName', owner_name, 'service', service,
      'startsAt', to_char(starts_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'), 'status', status
    ) FROM changed RETURNING *
  ) SELECT event_id AS "eventId", name, data, sequence::text AS cursor,
    to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS timestamp FROM emitted`;
  if (!rows.length) throw new Error('Appointment not found or already cancelled');
  const event = rows[0] as GroomingEvent;
  await deliverEvent(event);
  return event.data;
}

export async function eventDashboard() {
  const sql = db();
  const [events, counts] = await Promise.all([
    sql`SELECT e.event_id AS id, e.name, e.data, e.created_at AS timestamp, e.sequence::text AS cursor,
      COALESCE((SELECT jsonb_agg(jsonb_build_object('subscriber', d.subscription_id, 'status', d.http_status,
        'attempt', d.attempt, 'error', d.error) ORDER BY d.id) FROM deliveries d WHERE d.event_id = e.event_id), '[]') AS deliveries
      FROM events e ORDER BY e.sequence DESC LIMIT 12`,
    sql`SELECT count(*)::int AS count FROM subscriptions WHERE active AND (refresh_before IS NULL OR refresh_before > now())`,
  ]);
  return { events, activeSubscriptions: counts[0].count as number };
}
