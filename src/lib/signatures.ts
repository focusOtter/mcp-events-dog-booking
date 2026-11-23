import { createHash, createHmac } from 'node:crypto';

export function decodeSecret(secret: string) {
  if (!/^whsec_[A-Za-z0-9+/]+={0,2}$/.test(secret)) throw new Error('Invalid webhook secret');
  const encoded = secret.slice(6);
  const bytes = Buffer.from(encoded, 'base64');
  if (bytes.length < 24 || bytes.length > 64 || bytes.toString('base64').replace(/=+$/, '') !== encoded.replace(/=+$/, '')) {
    throw new Error('Webhook secret must encode 24–64 bytes');
  }
  return bytes;
}

export function signedHeaders(secret: string, id: string, body: string, subscriptionId: string, timestamp = String(Math.floor(Date.now() / 1000))) {
  const signature = createHmac('sha256', decodeSecret(secret)).update(`${id}.${timestamp}.${body}`).digest('base64');
  return {
    'content-type': 'application/json', 'webhook-id': id, 'webhook-timestamp': timestamp,
    'webhook-signature': `v1,${signature}`, 'X-MCP-Subscription-Id': subscriptionId,
  };
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([key, val]) => `${JSON.stringify(key)}:${canonical(val)}`).join(',')}}`;
  return JSON.stringify(value);
}

export function subscriptionId(url: string, name: string, args: Record<string, unknown>) {
  return `sub_${createHash('sha256').update(canonical([url, name, args])).digest('hex')}`;
}
