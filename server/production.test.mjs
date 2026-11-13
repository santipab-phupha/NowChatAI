import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createLimiter, createProductionServer } from './production.mjs';
import { isAllowedOrigin } from './origin.mjs';

test('accepts same-origin HTTPS and local HTTP; rejects cross-origin and remote HTTP', () => {
  const check = (origin, host) => isAllowedOrigin({ headers: { origin, host } });
  assert.equal(check('https://example.vercel.app', 'example.vercel.app'), true);
  assert.equal(check('http://localhost:3000', 'localhost:3000'), true);
  assert.equal(check('http://example.vercel.app', 'example.vercel.app'), false);
  assert.equal(check('https://evil.example', 'example.vercel.app'), false);
});

test('rate limit enforces per-client and per-instance ceilings and resets', () => {
  let time = 0;
  const limit = createLimiter({ windowMs: 100, maxPerClient: 2, maxTotal: 3, now: () => time });
  assert.equal(limit('a'), true); assert.equal(limit('a'), true); assert.equal(limit('a'), false);
  assert.equal(limit('b'), true); assert.equal(limit('c'), false);
  time = 100; assert.equal(limit('c'), true);
});

test('production server serves built assets and routes HTTPS-origin API requests', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'nowchat-test-'));
  await writeFile(join(dir, 'index.html'), 'welcome');
  const server = createProductionServer({ distDir: dir, limit: () => true });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const page = await fetch(base);
    assert.equal(await page.text(), 'welcome');
    const response = await fetch(`${base}/api/chat`, { method: 'POST', headers: { origin: `https://127.0.0.1:${server.address().port}`, 'content-type': 'application/json' }, body: '{}' });
    assert.equal(response.status, 400);
    const forbidden = await fetch(`${base}/api/followup`, { method: 'POST', headers: { origin: 'https://evil.example', host: 'example.vercel.app', 'content-type': 'application/json' }, body: '{}' });
    assert.equal(forbidden.status, 403);
    const missing = await fetch(`${base}/server/container.mjs`);
    assert.equal(missing.status, 404);
  } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); await rm(dir, { recursive: true, force: true }); }
});
