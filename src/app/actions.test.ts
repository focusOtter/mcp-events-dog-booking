import { beforeEach, expect, it, vi } from 'vitest';
import { z } from 'zod';

const mocks = vi.hoisted(() => ({ book: vi.fn(), cancel: vi.fn(), revalidate: vi.fn() }));
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidate }));
vi.mock('@/lib/repository', () => ({ bookAppointment: mocks.book, cancelAppointment: mocks.cancel }));
import { bookAction } from './actions';

beforeEach(() => { vi.resetAllMocks(); });

it('reports saved bookings as successful and invalidates the calendar', async () => {
  const form = new FormData();
  form.set('dogName', 'Biscuit');
  mocks.book.mockResolvedValue({});
  expect(await bookAction({}, form)).toHaveProperty('success');
  expect(mocks.book).toHaveBeenCalledWith(expect.objectContaining({ dogName: 'Biscuit' }));
  expect(mocks.revalidate).toHaveBeenCalledWith('/');
});

it('returns validation errors without success or calendar invalidation', async () => {
  const error = new z.ZodError([{ code: 'custom', path: ['startsAt'], message: 'Choose a future appointment' }]);
  mocks.book.mockRejectedValue(error);
  expect(await bookAction({}, new FormData())).toEqual({ error: 'Choose a future appointment' });
  expect(mocks.revalidate).not.toHaveBeenCalled();
});

it('returns a safe error for failed writes without marking the form successful', async () => {
  mocks.book.mockRejectedValue(new Error('private database detail'));
  expect(await bookAction({}, new FormData())).toEqual({ error: 'We could not complete your booking. Please try again.' });
  expect(mocks.revalidate).not.toHaveBeenCalled();
});
