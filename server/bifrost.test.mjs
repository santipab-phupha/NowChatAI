import { createServer } from 'node:http';
import { once } from 'node:events';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createBifrostClient } from './bifrost.mjs';
import { createChatHandler } from './chat.mjs';
import { createFollowupHandler } from './followup.mjs';

test('gateway URL is constrained to the local OpenAI integration', () => {
  for (const base of ['https://example.com/openai/v1', 'http://example.com/openai/v1', 'http://127.0.0.1:8080/v1', 'http://user:pass@localhost:8080/openai/v1']) {
    assert.throws(() => createBifrostClient('dummy', base));
  }
  assert.doesNotThrow(() => createBifrostClient('dummy', 'http://127.0.0.1:8080/openai/v1'));
});

test('chat and follow-up use the gateway Responses endpoint with their full request parameters', async () => {
  const requests = [];
  const graph = { title: 'Museum day', nodes: [
    { id: 'hours', label: 'Museum opening hours', kind: 'fact', baseline: 'Open 10 to 17.' },
    { id: 'visit', label: 'Visit museum', kind: 'step', baseline: 'Visit at 10.' },
  ], edges: [{ from: 'hours', to: 'visit' }] };
  const gateway = createServer(async (req, res) => {
    let body = ''; for await (const chunk of req) body += chunk;
    const request = JSON.parse(body); requests.push({ path: req.url, authorization: req.headers.authorization, body: request });
    const answer = request.text?.format?.name === 'followup_graph' ? JSON.stringify(graph) : 'Hello!';
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ id: 'resp_test', object: 'response', status: 'completed', output: [{ type: 'message', id: 'msg_test', role: 'assistant', status: 'completed', content: [{ type: 'output_text', text: answer, annotations: [] }] }] }));
  });
  gateway.listen(0, '127.0.0.1'); await once(gateway, 'listening');
  const baseURL = `http://127.0.0.1:${gateway.address().port}/openai/v1`;
  const clientFactory = key => createBifrostClient(key, baseURL);
  const chat = createChatHandler({ apiKey: 'gateway-test-key', clientFactory });
  const followup = createFollowupHandler({ apiKey: 'gateway-test-key', clientFactory });
  const app = createServer((req, res) => (req.url === '/chat' ? chat : followup)(req, res));
  app.listen(0, '127.0.0.1'); await once(app, 'listening');
  const address = `http://127.0.0.1:${app.address().port}`;
  const post = (path, value) => fetch(`${address}${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(value) });
  try {
    const chatResult = await post('/chat', { message: 'Hello', reasoningEffort: 'low' });
    assert.equal(chatResult.status, 200); assert.equal((await chatResult.json()).answer, 'Hello!');
    const followResult = await post('/followup', { action: 'create', question: 'Plan a museum visit', answer: 'Open 10 to 17; visit at 10.' });
    assert.equal(followResult.status, 200); assert.equal((await followResult.json()).graph.nodes.length, 2);
    assert.equal(requests.length, 2);
    for (const request of requests) {
      assert.equal(request.path, '/openai/v1/responses'); assert.equal(request.authorization, 'Bearer gateway-test-key');
      assert.equal(request.body.model, 'gpt-6-luna'); assert.equal(request.body.service_tier, 'fast');
      assert.deepEqual(request.body.reasoning, { effort: 'low' });
    }
    assert.equal(requests[0].body.tools[0].name, 'search_current_information');
    assert.equal(requests[1].body.text.format.type, 'json_schema');
  } finally {
    app.close(); gateway.close(); await Promise.all([once(app, 'close'), once(gateway, 'close')]);
  }
});

test('a stopped gateway fails clearly instead of silently using OpenAI directly', async () => {
  const temporary = createServer(); temporary.listen(0, '127.0.0.1'); await once(temporary, 'listening');
  const port = temporary.address().port; temporary.close(); await once(temporary, 'close');
  const app = createServer(createChatHandler({ apiKey: 'gateway-test-key', clientFactory: key => createBifrostClient(key, `http://127.0.0.1:${port}/openai/v1`) }));
  app.listen(0, '127.0.0.1'); await once(app, 'listening');
  try {
    const response = await fetch(`http://127.0.0.1:${app.address().port}/chat`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ message: 'Hello' }) });
    assert.equal(response.status, 502);
    assert.match((await response.json()).error, /Bifrost/);
  } finally { app.close(); await once(app, 'close'); }
});
