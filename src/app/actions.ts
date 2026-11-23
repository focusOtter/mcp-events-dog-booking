'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { bookAppointment, cancelAppointment } from '@/lib/repository';

export type ActionState = { error?: string; success?: string };
export async function bookAction(_previous: ActionState, form: FormData): Promise<ActionState> {
  try {
    await bookAppointment({ dogName: form.get('dogName'), ownerName: form.get('ownerName'), service: form.get('service'), startsAt: form.get('startsAt') });
  } catch (error) {
    return { error: error instanceof z.ZodError ? error.issues[0].message : 'We could not complete your booking. Please try again.' };
  }
  revalidatePath('/');
  return { success: 'All booked! We can’t wait to meet your pup.' };
}
export async function cancelAction(_previous: ActionState, form: FormData): Promise<ActionState> {
  try { await cancelAppointment({ id: form.get('id') }); }
  catch { return { error: 'This appointment could not be cancelled. Refresh and try again.' }; }
  revalidatePath('/');
  return { success: 'Appointment cancelled.' };
}
