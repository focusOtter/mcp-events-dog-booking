import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';

export function validateCallback(value: string, development = process.env.NODE_ENV === 'development') {
  const url = new URL(value);
  const local = development && url.protocol === 'http:' && url.hostname === '127.0.0.1';
  if ((!local && url.protocol !== 'https:') || url.username || url.password || url.hash || value.length > 2048) {
    throw new Error('Callback must use HTTPS without credentials or fragments (127.0.0.1 HTTP is development-only)');
  }
  return url;
}

function publicAddress(address: string) {
  if (isIP(address) === 4) {
    const [a, b] = address.split('.').map(Number);
    return !(a === 0 || a === 10 || a === 127 || a >= 224 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || (a === 198 && (b === 18 || b === 19)));
  }
  return isIP(address) === 6 && /^[23][0-9a-f]{3}:/i.test(address) && !address.toLowerCase().startsWith('2001:db8:');
}

// Pin the resolved public address to prevent callbacks from reaching internal services via DNS rebinding.
export async function postCallback(value: string, headers: Record<string, string>, body: string): Promise<{ status: number; body: string }> {
  const url = validateCallback(value);
  const hostname = url.hostname.replace(/^\[|\]$/g, '');
  const addresses = await lookup(hostname, { all: true });
  const local = process.env.NODE_ENV === 'development' && url.protocol === 'http:' && hostname === '127.0.0.1';
  if (!addresses.length || (!local && addresses.some(({ address }) => !publicAddress(address)))) throw new Error('Callback address is not public');
  const target = addresses[0];
  return new Promise((resolve, reject) => {
    const request = (url.protocol === 'https:' ? httpsRequest : httpRequest)(url, {
      method: 'POST', headers,
      lookup: (_host, options, callback) => options.all
        ? callback(null, [target]) : callback(null, target.address, target.family),
    }, response => {
      let text = '';
      response.on('data', chunk => { text += chunk; if (Buffer.byteLength(text) > 16384) request.destroy(new Error('Callback response too large')); });
      response.on('end', () => resolve({ status: response.statusCode ?? 0, body: text }));
      response.on('error', reject);
    });
    const timeout = setTimeout(() => request.destroy(new Error('Callback timeout')), 4000);
    request.on('close', () => clearTimeout(timeout));
    request.on('error', reject);
    request.end(body);
  });
}
