import { describe, expect, it } from 'vitest';
import { experimental_createMCPEventWebhook, type Experimental_MCPEventSubscription } from '@ai-sdk/mcp';
import { decodeSecret, signedHeaders, subscriptionId } from './signatures';

describe('Standard Webhooks signatures', () => {
  const secret = `whsec_${Buffer.alloc(32, 7).toString('base64')}`;
  it('is accepted by AI SDK webhook verification and rejects tampering', async () => {
    const url = 'https://app.example/webhook?mcp_event_subscription=key';
    const subscription: Experimental_MCPEventSubscription = {
      key: 'key', id: 'sub_1', name: 'appointment.booked', arguments: {},
      definition: { name: 'appointment.booked', delivery: ['webhook'], inputSchema: {}, payloadSchema: {} },
      delivery: { mode: 'webhook', url, secret }, cursor: null, truncated: false, status: 'active',
    };
    let calls = 0;
    const handler = experimental_createMCPEventWebhook({ store: {
      get: async () => subscription, getById: async () => subscription,
      set: async () => {}, update: async () => {}, delete: async () => {},
    }, onEvent: async () => { calls++; } });
    const body = JSON.stringify({ eventId: 'evt_1', name: 'appointment.booked', timestamp: new Date().toISOString(), data: { dogName: 'Biscuit' } });
    const headers = signedHeaders(secret, 'evt_1', body, 'sub_1');
    expect((await handler(new Request(url, { method: 'POST', headers, body }))).status).toBe(204);
    expect(calls).toBe(1);
    expect((await handler(new Request(url, { method: 'POST', headers, body: `${body} ` }))).status).toBe(401);
    const old = signedHeaders(secret, 'evt_1', body, 'sub_1', '1');
    expect((await handler(new Request(url, { method: 'POST', headers: old, body }))).status).toBe(401);
  });
  it('rejects malformed and out-of-range secrets', () => {
    for (const value of ['', 'whsec_!', `whsec_${Buffer.alloc(23).toString('base64')}`, `whsec_${Buffer.alloc(65).toString('base64')}`]) expect(() => decodeSecret(value)).toThrow();
    expect(decodeSecret(secret)).toHaveLength(32);
  });
});

describe('subscription identity', () => {
  it('is deterministic independent of argument key order', () => {
    expect(subscriptionId('https://a.example', 'event', { a: 1, b: { x: 2, y: 3 } })).toBe(subscriptionId('https://a.example', 'event', { b: { y: 3, x: 2 }, a: 1 }));
    expect(subscriptionId('https://a.example', 'event', {})).toBe(subscriptionId('https://a.example', 'event', {}));
    expect(subscriptionId('https://a.example', 'event', {})).not.toBe(subscriptionId('https://b.example', 'event', {}));
    expect(subscriptionId('https://a.example', 'event', {})).not.toBe(subscriptionId('https://a.example', 'other', {}));
  });
});
