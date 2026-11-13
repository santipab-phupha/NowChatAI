import { createServer } from 'node:http';
import { once } from 'node:events';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createChatHandler, safeSearchResults } from './chat.mjs';

async function withServer(options, run) {
  const server = createServer(createChatHandler(options));
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  try { await run(`http://127.0.0.1:${server.address().port}`); }
  finally { server.close(); await once(server, 'close'); }
}
function post(url, body, extra = {}) {
  return fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', ...extra }, body: JSON.stringify(body) });
}

test('forwards conversation to Responses and returns model text', async () => {
  let received;
  await withServer({ apiKey: 'test-key', clientFactory: () => ({ responses: { create: async input => { received = input; return { output_text: 'Hello!' }; } } }) }, async url => {
    const response = await post(url, { message: 'What next?', history: [{ role: 'user', content: 'Hi' }, { role: 'assistant', content: 'Hello' }] });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { answer: 'Hello!', sources: [], searchStatus: 'not_requested' });
    assert.equal(received.model, 'gpt-6-luna');
    assert.equal(received.service_tier, 'fast');
    assert.deepEqual(received.reasoning, { effort: 'medium' });
    assert.deepEqual(received.input.map(item => item.role), ['user', 'assistant', 'user']);
    assert.equal(received.input[2].content, 'What next?');
  });
});

test('searches for explicit current facts and sends numbered evidence back to the model', async () => {
  const calls = [];
  const fakeClient = { responses: { create: async input => {
    calls.push(structuredClone(input));
    if (calls.length === 1) return { output: [{ type: 'function_call', name: 'search_current_information', call_id: 'call_1', arguments: JSON.stringify({ query: 'USD THB latest rate' }) }] };
    return { status: 'completed', output: [], output_text: 'The indicative rate is 35 THB [1].', service_tier: 'priority' };
  } } };
  await withServer({ apiKey: 'test-key', tavilyKey: 'test-search-key', clientFactory: () => fakeClient, search: async (query, key) => {
    assert.equal(query, 'USD THB latest rate');
    assert.equal(key, 'test-search-key');
    return [{ title: 'Example rate', url: 'https://example.com/rate', content: 'USD is about 35 THB', published_date: '2026-11-12' }, { title: 'Bad URL', url: 'javascript:alert(1)', content: 'Do not use' }];
  } }, async url => {
    const beforeSearch = Date.now();
    const response = await post(url, { message: 'What is the latest USD to THB rate?', reasoningEffort: 'low' });
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.deepEqual({ ...body, searchedAt: undefined }, { answer: 'The indicative rate is 35 THB [1].', sources: [{ id: 1, title: 'Example rate', url: 'https://example.com/rate', estimatedSourceDate: '2026-11-12' }], searchStatus: 'searched', serviceTier: 'priority', searchedAt: undefined });
    assert.ok(Date.parse(body.searchedAt) >= beforeSearch && Date.parse(body.searchedAt) <= Date.now());
    assert.equal(calls.length, 2);
    assert.equal(calls[0].tool_choice.name, 'search_current_information');
    assert.equal(calls[0].service_tier, 'fast');
    assert.equal(calls[1].service_tier, 'fast');
    assert.equal(calls[1].reasoning.effort, 'low');
    const output = calls[1].input.find(item => item.type === 'function_call_output');
    assert.equal(output.call_id, 'call_1');
    assert.equal(JSON.parse(output.output).results[0].id, 1);
    assert.equal(JSON.parse(output.output).results[0].estimated_source_date, '2026-11-12');
    assert.equal(JSON.parse(output.output).results.length, 1);
  });
});

test('preserves valid estimated source dates without inventing dates or shifting date-only values', () => {
  const sources = [];
  safeSearchResults([
    { title: 'Date only', url: 'https://example.com/day', content: 'evidence', published_date: '2026-11-12' },
    { title: 'With timezone', url: 'https://example.com/time', content: 'evidence', published_date: '2026-11-12T09:30:00+07:00' },
    { title: 'Invalid day', url: 'https://example.com/invalid', content: 'evidence', published_date: '2026-02-30' },
    { title: 'No timezone', url: 'https://example.com/local', content: 'evidence', published_date: '2026-11-12T09:30:00' },
    { title: 'Missing', url: 'https://example.com/missing', content: 'evidence' },
  ], sources);
  assert.equal(sources[0].estimatedSourceDate, '2026-11-12');
  assert.equal(sources[1].estimatedSourceDate, '2026-11-12T02:30:00.000Z');
  assert.equal(sources[2].estimatedSourceDate, undefined);
  assert.equal(sources[3].estimatedSourceDate, undefined);
  assert.equal(sources[4].estimatedSourceDate, undefined);
  safeSearchResults([{ title: 'Dated metadata', url: 'https://example.com/missing', content: 'evidence', published_date: 'Tue, 11 Mar 2025 17:00:00 GMT' }], sources);
  assert.equal(sources.length, 5);
  assert.equal(sources[4].estimatedSourceDate, '2025-03-11T17:00:00.000Z');
});

test('fails clearly when current evidence is required but the search key is missing', async () => {
  await withServer({ apiKey: 'test-key', clientFactory: () => { throw Error('must not call'); } }, async url => {
    const response = await post(url, { message: 'What is the latest inflation rate?' });
    assert.equal(response.status, 503);
    assert.match((await response.json()).error, /Tavily API key/);
  });
});

test('the model can request live evidence for a numeric question without explicit freshness words', async () => {
  let modelCalls = 0;
  await withServer({ apiKey: 'test-key', tavilyKey: 'test-search-key', search: async () => [{ title: 'Rate information', url: 'https://example.com/rate', content: 'The benchmark rate is 2 percent.' }], clientFactory: () => ({ responses: { create: async input => {
    modelCalls++;
    if (modelCalls === 1) {
      assert.equal(input.tool_choice, 'auto');
      return { output: [{ type: 'function_call', name: 'search_current_information', call_id: 'call_1', arguments: '{"query":"central bank policy rate"}' }] };
    }
    return { output: [], output_text: 'The benchmark rate is 2 percent [1].' };
  } } }) }, async url => {
    const response = await post(url, { message: 'What is the central bank policy rate?' });
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.searchStatus, 'searched');
    assert.equal(body.sources[0].url, 'https://example.com/rate');
    assert.equal(modelCalls, 2);
  });
});

test('does not invent an answer when search fails or finds no usable evidence', async () => {
  for (const search of [async () => { throw new Error('private detail'); }, async () => []]) {
    let modelCalls = 0;
    await withServer({ apiKey: 'test-key', tavilyKey: 'test-search-key', search, clientFactory: () => ({ responses: { create: async () => { modelCalls++; return { output: [{ type: 'function_call', name: 'search_current_information', call_id: 'call_1', arguments: '{"query":"latest rate"}' }] }; } } }) }, async url => {
      const response = await post(url, { message: 'What is the latest rate?' });
      assert.equal(response.status, 502);
      const body = await response.json();
      assert.equal(body.answer, undefined);
      assert.doesNotMatch(body.error, /private detail|test-search-key/);
      assert.equal(modelCalls, 1);
    });
  }
});

test('rejects answer citations that do not match real returned search results', async () => {
  let modelCalls = 0;
  await withServer({ apiKey: 'test-key', tavilyKey: 'test-search-key', search: async () => [{ title: 'Example', url: 'https://example.com/', content: 'Evidence' }], clientFactory: () => ({ responses: { create: async () => ++modelCalls === 1 ? { output: [{ type: 'function_call', name: 'search_current_information', call_id: 'call_1', arguments: '{"query":"latest rate"}' }] } : { output: [], output_text: 'A fabricated citation [2].' } } }) }, async url => {
    const response = await post(url, { message: 'What is the latest rate?' });
    assert.equal(response.status, 502);
    assert.match((await response.json()).error, /source/);
  });
});

test('accepts each supported reasoning level and rejects unsupported values', async () => {
  let received;
  await withServer({ apiKey: 'test-key', clientFactory: () => ({ responses: { create: async input => { received = input; return { output_text: 'ok' }; } } }) }, async url => {
    for (const reasoningEffort of ['none', 'low', 'medium', 'high', 'xhigh', 'max']) {
      const response = await post(url, { message: 'hi', reasoningEffort });
      assert.equal(response.status, 200);
      assert.equal(received.model, 'gpt-6-luna');
      assert.equal(received.reasoning.effort, reasoningEffort);
      assert.ok(received.max_output_tokens >= 4096);
    }
    for (const reasoningEffort of ['ultra', 'HIGH', '', null, 42]) {
      assert.equal((await post(url, { message: 'hi', reasoningEffort })).status, 400);
    }
  });
});

test('does not present an incomplete response as a completed answer', async () => {
  await withServer({ apiKey: 'test-key', clientFactory: () => ({ responses: { create: async () => ({ status: 'incomplete', output_text: 'Partial answer' }) } }) }, async url => {
    const response = await post(url, { message: 'hi', reasoningEffort: 'max' });
    assert.equal(response.status, 502);
    const body = await response.json();
    assert.match(body.error, /incomplete/i);
    assert.equal(body.answer, undefined);
  });
});

test('rejects invalid input and cross-origin requests without calling the model', async () => {
  await withServer({ apiKey: 'test-key', clientFactory: () => { throw Error('must not call'); } }, async url => {
    assert.equal((await post(url, { message: '' })).status, 400);
    assert.equal((await post(url, { message: 'hi', history: [{ role: 'system', content: 'x' }] })).status, 400);
    assert.equal((await post(url, { message: 'hi' }, { origin: 'https://example.com' })).status, 403);
  });
});

test('configuration and provider failures are sanitized', async () => {
  await withServer({ apiKey: '' }, async url => {
    const response = await post(url, { message: 'hi' });
    assert.equal(response.status, 503);
  });
  await withServer({ apiKey: 'test-key', clientFactory: () => ({ responses: { create: async () => { throw Object.assign(new Error('sensitive diagnostic'), { status: 401 }); } } }) }, async url => {
    const response = await post(url, { message: 'hi' });
    assert.equal(response.status, 502);
    assert.doesNotMatch(JSON.stringify(await response.json()), /sensitive diagnostic|test-key/);
  });
});
