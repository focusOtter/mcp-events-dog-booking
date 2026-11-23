import { createMcpHandler } from '@/lib/mcp';

export const maxDuration = 60;
export const POST = createMcpHandler();
export function GET() { return new Response(null, { status: 405, headers: { Allow: 'POST' } }); }
