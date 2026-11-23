import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ sql: Object.assign(vi.fn(), { transaction: vi.fn() }), post: vi.fn() }));
vi.mock('./db', () => ({ db: () => mocks.sql }));
vi.mock('./callback', async importOriginal => ({ ...await importOriginal<typeof import('./callback')>(), postCallback: mocks.post }));
import { createMcpHandler } from './mcp';
import { subscribeEvent, unsubscribeEvent } from './subscriptions';
import { validateCallback } from './callback';

const secret = `whsec_${Buffer.alloc(32, 9).toString('base64')}`;
const subscription = { name: 'appointment.booked', arguments: {}, delivery: { mode: 'webhook', url: 'https://receiver.example/events', secret } };
const operations = { subscribeEvent, unsubscribeEvent, listAppointments: vi.fn(async () => []), bookAppointment: vi.fn(), cancelAppointment: vi.fn() };
const handler = createMcpHandler(operations);
async function rpc(method: string, params = {}, id: unknown = 1) {
  const response = await handler(new Request('http://localhost/api/mcp', { method: 'POST', body: JSON.stringify({ jsonrpc: '2.0', id, method, params }) }));
  return response.json();
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.sql.mockResolvedValue([{ cursor: '0' }]);
  mocks.sql.transaction.mockResolvedValue([[], [{ id: 'subscription' }]]);
  mocks.post.mockImplementation(async (_url, _headers, body) => ({ status: 200, body: JSON.stringify({ challenge: JSON.parse(body).challenge }) }));
});

describe('stateless JSON-RPC', () => {
  it('returns a clear JSON-RPC error when the active subscription cap rejects an insert', async () => {
    mocks.sql.transaction.mockResolvedValueOnce([[], []]);
    expect((await rpc('events/subscribe', subscription)).error).toMatchObject({ code: -32000, message: expect.stringContaining('limit reached (25)') });
  });
  it('serializes capacity checks and allows active subscriptions to renew at capacity', async () => {
    expect((await rpc('events/subscribe', subscription)).result).toHaveProperty('id');
    const queries = mocks.sql.mock.calls.map(call => call[0].join('?'));
    expect(queries.some(query => query.includes('LOCK TABLE subscriptions IN SHARE ROW EXCLUSIVE MODE'))).toBe(true);
    expect(queries.some(query => query.includes('< 25') && query.includes('OR EXISTS') && query.includes('refresh_before > now()'))).toBe(true);
    expect(mocks.sql.transaction).toHaveBeenCalledTimes(1);
  });
  it('discovers both capability dialects and initializes legacy clients', async () => {
    const discover = await rpc('server/discover');
    expect(discover.result).toMatchObject({ resultType: 'complete', supportedVersions: ['2026-07-28', '2025-11-25'], capabilities: { tools: {}, events: {}, extensions: { 'io.modelcontextprotocol/events': {} } } });
    expect((await rpc('initialize')).result).toMatchObject({ resultType: 'complete', protocolVersion: '2025-11-25' });
    const notification = await handler(new Request('http://localhost/api/mcp', { method: 'POST', body: JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) }));
    expect(notification.status).toBe(202);
  });
  it('lists event schemas and tools and handles an empty appointment list', async () => {
    const result = (await rpc('events/list')).result;
    expect(result.resultType).toBe('complete');
    expect(result.events.map((e: {name: string}) => e.name)).toEqual(['appointment.booked', 'appointment.cancelled']);
    expect(result.events[0]).toHaveProperty('payloadSchema');
    expect((await rpc('tools/list')).result.tools).toHaveLength(3);
    expect((await rpc('tools/call', { name: 'list_appointments' })).result.structuredContent).toEqual({ appointments: [] });
  });
  it('rejects malformed JSON, envelopes, unknown methods, and invalid tool inputs', async () => {
    const response = await handler(new Request('http://localhost', { method: 'POST', body: '{' }));
    expect((await response.json()).error.code).toBe(-32700);
    const invalid = await handler(new Request('http://localhost', { method: 'POST', body: '[]' }));
    expect((await invalid.json()).error.code).toBe(-32600);
    expect((await rpc('events/poll')).error.code).toBe(-32601);
    expect((await rpc('tools/call', {})).error.code).toBe(-32602);
  });
});

describe('subscriptions', () => {
  it.each([
    [undefined, 3600000], [null, 86400000], [60000, 60000], [172800000, 86400000],
  ])('grants a finite bounded lease for requested TTL %s', async (ttlMs, granted) => {
    const before = Date.now();
    const result = (await rpc('events/subscribe', { ...subscription, ttlMs })).result;
    expect(Date.parse(result.refreshBefore)).toBeGreaterThanOrEqual(before + granted);
    expect(Date.parse(result.refreshBefore)).toBeLessThanOrEqual(Date.now() + granted);
    const insert = mocks.sql.mock.calls.find(call => call[0].join('?').includes('INSERT INTO subscriptions'))!;
    expect(insert[0].join('?')).toContain('SELECT count(*) FROM subscriptions WHERE active AND (refresh_before IS NULL OR refresh_before > now())');
    expect(insert).toContain(result.refreshBefore);
  });
  it('verifies callbacks, caps TTL, renews idempotently, and unsubscribes', async () => {
    const first = (await rpc('events/subscribe', { ...subscription, ttlMs: 172800000 })).result;
    expect(first).toMatchObject({ resultType: 'complete', cursor: '0', truncated: false });
    expect(Date.parse(first.refreshBefore) - Date.now()).toBeLessThanOrEqual(86400000);
    expect(Date.parse(first.refreshBefore) - Date.now()).toBeGreaterThan(86390000);
    expect(mocks.post).toHaveBeenCalledOnce();
    expect(mocks.post.mock.calls[0][1]['X-MCP-Subscription-Id']).toBe(first.id);
    const renewed = (await rpc('events/subscribe', { ...subscription, ttlMs: null, cursor: '4' })).result;
    expect(renewed.id).toBe(first.id);
    expect(Date.parse(renewed.refreshBefore) - Date.now()).toBeLessThanOrEqual(86400000);
    expect(Date.parse(renewed.refreshBefore) - Date.now()).toBeGreaterThan(86390000);
    expect(renewed.cursor).toBe('4');
    expect((await rpc('events/unsubscribe', subscription)).result).toEqual({ resultType: 'complete' });
  });
  it.each([
    { ...subscription, delivery: { ...subscription.delivery, url: 'http://example.com' } },
    { ...subscription, delivery: { ...subscription.delivery, secret: 'whsec_short' } },
    { ...subscription, arguments: { service: 'invalid' } },
    { ...subscription, ttlMs: -1 },
    {},
  ])('rejects invalid subscribe params without delivery or persistence', async params => {
    expect((await rpc('events/subscribe', params)).error.code).toBe(-32602);
    expect(mocks.post).not.toHaveBeenCalled();
    expect(mocks.sql).not.toHaveBeenCalled();
  });
  it('returns CallbackEndpointError and does not activate failed callbacks', async () => {
    mocks.post.mockResolvedValue({ status: 200, body: '{"challenge":"wrong"}' });
    expect((await rpc('events/subscribe', subscription)).error).toMatchObject({ code: -32027, message: 'CallbackEndpointError', data: { reason: 'challenge_failed' } });
    expect(mocks.sql).not.toHaveBeenCalled();
  });
  it('allows literal loopback only in dev and rejects URL credentials', () => {
    expect(() => validateCallback('http://127.0.0.1:3004/events', true)).not.toThrow();
    expect(() => validateCallback('http://127.0.0.1:3004/events', false)).toThrow();
    expect(() => validateCallback('http://localhost/events', true)).toThrow();
    expect(() => validateCallback('https://user:pass@example.com/events', true)).toThrow();
  });
});
