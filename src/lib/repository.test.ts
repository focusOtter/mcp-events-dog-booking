import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ sql: vi.fn(), post: vi.fn() }));
vi.mock('./db', () => ({ db: () => mocks.sql }));
vi.mock('./callback', () => ({ postCallback: mocks.post }));
import { bookAppointment, cancelAppointment, deliverEvent } from './repository';
import type { GroomingEvent } from './domain';

const event: GroomingEvent = { eventId: '00000000-0000-4000-8000-000000000001', name: 'appointment.booked', timestamp: new Date().toISOString(), cursor: '1', data: {
  id: '00000000-0000-4000-8000-000000000002', dogName: 'Biscuit', ownerName: 'Jamie', service: 'Full groom', startsAt: new Date(Date.now() + 86400000).toISOString(), status: 'booked',
} };
beforeEach(() => { vi.clearAllMocks(); });

it('emits no HTTP requests when there are no matching subscribers', async () => {
  mocks.sql.mockResolvedValue([]);
  await deliverEvent(event);
  expect(mocks.post).not.toHaveBeenCalled();
});
it('logs each attempt, retries a connection failure, then stops after success', async () => {
  mocks.sql.mockResolvedValueOnce([{ id: 'sub_1', url: 'https://receiver.example', secret: `whsec_${Buffer.alloc(32).toString('base64')}` }]).mockResolvedValue([]);
  mocks.post.mockRejectedValueOnce(new Error('connection failed')).mockResolvedValue({ status: 204, body: '' });
  await deliverEvent(event);
  expect(mocks.post).toHaveBeenCalledTimes(2);
  expect(mocks.sql).toHaveBeenCalledTimes(3);
  expect(mocks.sql.mock.calls[1].slice(1)).toEqual(['sub_1', event.eventId, 1, null, 'Callback connection failed']);
  expect(mocks.sql.mock.calls[2].slice(1)).toEqual(['sub_1', event.eventId, 2, 204, null]);
  expect(mocks.post.mock.calls[0][1]['webhook-id']).toBe(event.eventId);
});
it('caps unsuccessful delivery at three recorded attempts', async () => {
  mocks.sql.mockResolvedValueOnce([{ id: 'sub_1', url: 'https://receiver.example', secret: `whsec_${Buffer.alloc(32).toString('base64')}` }]).mockResolvedValue([]);
  mocks.post.mockResolvedValue({ status: 503, body: '' });
  await deliverEvent(event);
  expect(mocks.post).toHaveBeenCalledTimes(3);
  expect(mocks.sql).toHaveBeenCalledTimes(4);
});
it('rejects empty booking inputs before database access', async () => {
  await expect(bookAppointment({})).rejects.toThrow();
  expect(mocks.sql).not.toHaveBeenCalled();
});
it('does not emit a duplicate cancellation for a missing/already-cancelled appointment', async () => {
  mocks.sql.mockResolvedValue([]);
  await expect(cancelAppointment({ id: event.data.id })).rejects.toThrow('Appointment not found or already cancelled');
  expect(mocks.sql).toHaveBeenCalledTimes(1);
  expect(mocks.post).not.toHaveBeenCalled();
});
