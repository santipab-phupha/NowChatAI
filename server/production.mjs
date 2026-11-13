import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { createChatHandler } from './chat.mjs';
import { createFollowupHandler } from './followup.mjs';
import { createBifrostClient } from './bifrost.mjs';

const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.webp': 'image/webp' };

// These limits are per container instance. They reduce accidental spikes but
// are not a shared rate limit; use Vercel Firewall and provider quotas too.
export function createLimiter({ windowMs = 600_000, maxPerClient = 20, maxTotal = 100, now = Date.now } = {}) {
  let start = now(); let total = 0; const clients = new Map();
  return (id) => {
    if (now() - start >= windowMs) { start = now(); total = 0; clients.clear(); }
    const count = clients.get(id) || 0;
    if (count >= maxPerClient || total >= maxTotal) return false;
    clients.set(id, count + 1); total++;
    return true;
  };
}

export function createProductionServer({ distDir, gatewayUrl = 'http://127.0.0.1:19580/openai/v1', tavilyKey = '', limit = createLimiter() }) {
  const root = resolve(distDir);
  const clientFactory = key => createBifrostClient(key, gatewayUrl);
  const settings = { apiKey: 'bifrost-local', tavilyKey, clientFactory };
  const routes = { '/api/chat': createChatHandler(settings), '/api/followup': createFollowupHandler(settings) };
  return createServer(async (req, res) => {
    const path = new URL(req.url, 'http://localhost').pathname;
    if (Object.hasOwn(routes, path)) {
      if (req.method === 'POST') {
        const trustedForwardedIp = process.env.VERCEL ? req.headers['x-vercel-forwarded-for'] : undefined;
        const client = typeof trustedForwardedIp === 'string' ? trustedForwardedIp.split(',')[0].trim() : req.socket.remoteAddress || 'unknown';
        if (!limit(client)) {
          res.writeHead(429, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'retry-after': '600' });
          return res.end(JSON.stringify({ error: 'Too many requests. Please try again later.' }));
        }
      }
      return routes[path](req, res);
    }
    if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405); return res.end(); }
    try {
      const decoded = decodeURIComponent(path);
      const filePath = resolve(root, `.${decoded === '/' ? '/index.html' : decoded}`);
      if (filePath !== root && !filePath.startsWith(root + sep)) throw new Error('Invalid path');
      const bytes = await readFile(filePath);
      res.writeHead(200, { 'content-type': mime[extname(filePath)] || 'application/octet-stream', 'x-content-type-options': 'nosniff', 'cache-control': filePath.endsWith('index.html') ? 'no-cache' : 'public, max-age=3600' });
      return res.end(req.method === 'HEAD' ? undefined : bytes);
    } catch { res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }); return res.end('Not found'); }
  });
}
