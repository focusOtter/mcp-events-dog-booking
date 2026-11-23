import { connection } from 'next/server';
import { Suspense } from 'react';
import { listAppointments, eventDashboard } from '@/lib/repository';
import { BookingDashboard } from './booking-dashboard';

async function Content() {
  await connection();
  const [appointments, dashboard] = await Promise.all([listAppointments(), eventDashboard()]);
  return <BookingDashboard appointments={appointments} dashboard={JSON.parse(JSON.stringify(dashboard))} />;
}

export default function Home() {
  return <Suspense fallback={<main className="loading-state">Getting the good shampoo ready…</main>}><Content /></Suspense>;
}
