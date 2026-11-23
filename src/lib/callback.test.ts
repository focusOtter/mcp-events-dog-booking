import { EventEmitter } from 'node:events';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ lookup: vi.fn(), request: vi.fn() }));
vi.mock('node:dns/promises', () => ({ lookup: mocks.lookup }));
vi.mock('node:https', () => ({ request: mocks.request }));
import { postCallback } from './callback';

beforeEach(() => { vi.resetAllMocks(); vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

it('bounds DNS resolution by the callback deadline', async () => {
  mocks.lookup.mockReturnValue(new Promise(() => {}));
  const result = expect(postCallback('https://receiver.example', {}, '{}')).rejects.toThrow('Callback timeout');
  await vi.advanceTimersByTimeAsync(5000);
  await result;
  expect(mocks.request).not.toHaveBeenCalled();
});

it('aborts an HTTP request that does not complete within five seconds', async () => {
  mocks.lookup.mockResolvedValue([{ address: '8.8.8.8', family: 4 }]);
  let signal: AbortSignal | undefined;
  mocks.request.mockImplementation((_url, options) => {
    signal = options.signal;
    const request = Object.assign(new EventEmitter(), { end: vi.fn() });
    signal?.addEventListener('abort', () => request.emit('error', new Error('Aborted')));
    return request;
  });
  const result = expect(postCallback('https://receiver.example', {}, '{}')).rejects.toThrow();
  await vi.advanceTimersByTimeAsync(5000);
  await result;
  expect(mocks.request).toHaveBeenCalledOnce();
  expect(signal?.aborted).toBe(true);
});

it('rejects empty DNS responses without posting', async () => {
  mocks.lookup.mockResolvedValue([]);
  await expect(postCallback('https://receiver.example', {}, '{}')).rejects.toThrow('Callback address is not public');
  expect(mocks.request).not.toHaveBeenCalled();
  expect(vi.getTimerCount()).toBe(0);
});
