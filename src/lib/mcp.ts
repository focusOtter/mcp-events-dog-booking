import { z } from 'zod';
import { bookingSchema, cancelSchema, eventDefinitions } from './domain';
import { bookAppointment, cancelAppointment, listAppointments } from './repository';
import { RpcError, subscribeEvent, unsubscribeEvent } from './subscriptions';

const capabilities = {
  tools: {},
  // AI SDK 2.0.103 checks top-level events; SEP-3415 negotiates extensions. Advertise both deliberately.
  events: {}, extensions: { 'io.modelcontextprotocol/events': {} },
};
const serverInfo = { name: 'otter-paws-booking', version: '1.0.0' };
const tools = [
  { name: 'list_appointments', description: 'List upcoming grooming appointments.', inputSchema: { type: 'object', properties: {}, additionalProperties: false } },
  { name: 'book_appointment', description: 'Book a dog grooming appointment. startsAt is a future ISO datetime with timezone.', inputSchema: z.toJSONSchema(bookingSchema) },
  { name: 'cancel_appointment', description: 'Cancel a booked appointment by ID.', inputSchema: z.toJSONSchema(cancelSchema) },
];
const defaultOperations = { listAppointments, bookAppointment, cancelAppointment, subscribeEvent, unsubscribeEvent };

export function createMcpHandler(operations = defaultOperations) {
  return async function handle(request: Request): Promise<Response> {
    let value: unknown;
    try { value = await request.json(); }
    catch { return Response.json({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }); }
    const envelope = z.object({ jsonrpc: z.literal('2.0'), id: z.union([z.string(), z.number(), z.null()]).optional(), method: z.string(), params: z.record(z.string(), z.unknown()).optional() }).safeParse(value);
    if (!envelope.success) return Response.json({ jsonrpc: '2.0', id: null, error: { code: -32600, message: 'Invalid Request' } });
    const { id, method, params = {} } = envelope.data;
    if (id === undefined) return new Response(null, { status: 202 });
    try {
      let result: Record<string, unknown>;
      switch (method) {
        case 'server/discover':
          result = { supportedVersions: ['2026-07-28', '2025-11-25'], capabilities,
            _meta: { 'io.modelcontextprotocol/serverInfo': serverInfo } }; break;
        case 'initialize':
          result = { protocolVersion: '2025-11-25', capabilities, serverInfo }; break;
        case 'ping': result = {}; break;
        case 'tools/list': result = { tools }; break;
        case 'events/list': result = { events: eventDefinitions }; break;
        case 'events/subscribe': result = await operations.subscribeEvent(params); break;
        case 'events/unsubscribe': result = await operations.unsubscribeEvent(params); break;
        case 'tools/call': {
          const input = z.object({ name: z.string(), arguments: z.record(z.string(), z.unknown()).default({}) }).parse(params);
          let data;
          if (input.name === 'list_appointments') {
            z.object({}).strict().parse(input.arguments);
            data = { appointments: await operations.listAppointments() };
          } else if (input.name === 'book_appointment') data = { appointment: await operations.bookAppointment(input.arguments) };
          else if (input.name === 'cancel_appointment') data = { appointment: await operations.cancelAppointment(input.arguments) };
          else throw new RpcError(-32602, 'Unknown tool');
          result = { content: [{ type: 'text', text: JSON.stringify(data) }], structuredContent: data, isError: false }; break;
        }
        default: throw new RpcError(-32601, 'Method not found');
      }
      return Response.json({ jsonrpc: '2.0', id, result: { ...result, resultType: 'complete' } });
    } catch (error) {
      const fault = error instanceof RpcError ? error : error instanceof z.ZodError
        ? new RpcError(-32602, 'Invalid params', { issues: error.issues.map(issue => ({ path: issue.path, message: issue.message })) })
        : new RpcError(-32603, 'Operation failed');
      return Response.json({ jsonrpc: '2.0', id, error: { code: fault.code, message: fault.message, ...(fault.data ? { data: fault.data } : {}) } });
    }
  };
}
