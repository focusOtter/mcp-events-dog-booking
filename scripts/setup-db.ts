import nextEnv from '@next/env';
import { db } from '../src/lib/db';

nextEnv.loadEnvConfig(process.cwd());
const sql = db();
await sql.transaction([
  sql`CREATE TABLE IF NOT EXISTS appointments (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), dog_name text NOT NULL,
    owner_name text NOT NULL, service text NOT NULL, starts_at timestamptz NOT NULL,
    status text NOT NULL DEFAULT 'booked' CHECK (status IN ('booked', 'cancelled')),
    created_at timestamptz NOT NULL DEFAULT now()
  )`,
  sql`CREATE TABLE IF NOT EXISTS subscriptions (
    id text PRIMARY KEY, url text NOT NULL, name text NOT NULL,
    arguments jsonb NOT NULL DEFAULT '{}', secret text NOT NULL,
    refresh_before timestamptz, active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now()
  )`,
  sql`CREATE TABLE IF NOT EXISTS events (
    sequence bigserial PRIMARY KEY, event_id uuid UNIQUE NOT NULL DEFAULT gen_random_uuid(),
    name text NOT NULL, data jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
  )`,
  sql`CREATE TABLE IF NOT EXISTS deliveries (
    id bigserial PRIMARY KEY, subscription_id text NOT NULL,
    event_id uuid NOT NULL REFERENCES events(event_id), attempt integer NOT NULL,
    http_status integer, error text, created_at timestamptz NOT NULL DEFAULT now()
  )`,
  sql`CREATE INDEX IF NOT EXISTS appointments_upcoming ON appointments(starts_at) WHERE status = 'booked'`,
  sql`CREATE INDEX IF NOT EXISTS deliveries_event ON deliveries(event_id, created_at)`,
]);
console.log('Schema ready (idempotent).');
