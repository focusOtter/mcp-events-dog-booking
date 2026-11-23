import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { createMCPClient, experimental_createMCPEventWebhook, type Experimental_MCPEventSubscription, type Experimental_MCPEventStore } from '@ai-sdk/mcp';

const subscriptions = new Map<string, Experimental_MCPEventSubscription>();
const store: Experimental_MCPEventStore = {
  get: async key => subscriptions.get(key),
  getById: async id => [...subscriptions.values()].find(value => value.id === id),
  set: async subscription => { subscriptions.set(subscription.key, subscription); },
  update: async (key, patch) => { const value = subscriptions.get(key); if (!value) throw new Error('Unknown subscription'); subscriptions.set(key, { ...value, ...patch }); },
  delete: async key => { subscriptions.delete(key); },
};
const received: string[] = [];
const handler = experimental_createMCPEventWebhook({ store, onEvent: async ({ event }) => {
  received.push(event.name);
  console.log(`onEvent: ${event.name} · ${event.data.dogName}`);
} });
const receiver = createServer(async (request, response) => {
  try {
    const chunks = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    const result = await handler(new Request(`http://127.0.0.1:3004${request.url}`, {
      method: request.method, headers: request.headers as Record<string, string>, body: Buffer.concat(chunks),
    }));
    response.writeHead(result.status, Object.fromEntries(result.headers));
    response.end(Buffer.from(await result.arrayBuffer()));
  } catch { response.writeHead(500).end(); }
});
receiver.listen(3004, '127.0.0.1');
await once(receiver, 'listening');
const client = await createMCPClient({ transport: { type: 'http', url: 'http://127.0.0.1:3000/api/mcp' }, experimental_events: { store } });
const ids: string[] = [];
let appointmentId: string | undefined;
try {
  const catalog = await client.experimental_events.list();
  console.log('Events:', catalog.events.map(event => event.name).join(', '));
  for (const name of ['appointment.booked', 'appointment.cancelled']) {
    const subscription = await client.experimental_events.subscribe({ name, delivery: { mode: 'webhook', url: 'http://127.0.0.1:3004/events', allowInsecureLocalhost: true }, ttlMs: 60000 });
    ids.push(subscription.id);
    console.log(`Subscribed and callback verified: ${name}`);
  }
  const tools = await client.tools();
  assert(tools.book_appointment.execute && tools.cancel_appointment.execute);
  const booked = await tools.book_appointment.execute({ dogName: 'Biscuit E2E', ownerName: 'Demo customer', service: 'Full groom', startsAt: new Date(Date.now() + 86400000).toISOString() }, { toolCallId: 'book', messages: [], context: {} });
  const body = JSON.parse((booked as { content: { text: string }[] }).content[0].text);
  appointmentId = body.appointment.id;
  assert.deepEqual(received, ['appointment.booked']);
  console.log('Booking tool returned appointment; signed booked delivery accepted.');
  await tools.cancel_appointment.execute({ id: appointmentId }, { toolCallId: 'cancel', messages: [], context: {} });
  appointmentId = undefined;
  assert.deepEqual(received, ['appointment.booked', 'appointment.cancelled']);
  console.log('Cancellation tool returned; signed cancelled delivery accepted.');
  console.log('PASS: list → subscribe ×2 → book → onEvent → cancel → onEvent');
} finally {
  if (appointmentId) {
    const tools = await client.tools();
    await tools.cancel_appointment.execute?.({ id: appointmentId }, { toolCallId: 'cleanup', messages: [], context: {} });
  }
  for (const id of ids) await client.experimental_events.unsubscribe({ id });
  await client.close();
  receiver.close();
  console.log('Cleaned up subscriptions and receiver.');
}
