import { createServer } from 'node:http';
import { once } from 'node:events';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFollowupHandler } from './followup.mjs';

const sample = {
  title: 'Museum visit',
  nodes: [{ id: 'hours', label: 'Museum Siam Bangkok opening hours', kind: 'fact', baseline: 'Open 10:00–18:00' },
    { id: 'visit', label: 'Visit Museum Siam', kind: 'step', baseline: 'Visit at 16:00' }],
  edges: [{ from: 'hours', to: 'visit' }],
};
async function withServer(options, run) {
  const server = createServer(createFollowupHandler(options)); server.listen(0, '127.0.0.1'); await once(server, 'listening');
  try { await run(`http://127.0.0.1:${server.address().port}`); } finally { server.close(); await once(server, 'close'); }
}
function post(url, body, headers = {}) { return fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) }); }
const fakeClient = answer => () => ({ responses: { create: async req => { assert.equal(req.service_tier, 'fast'); return { output_text: JSON.stringify(answer) }; } } });
const body = { question: 'Plan a museum visit', answer: 'The museum is open 10:00–18:00. Visit at 16:00.' };

test('creates baseline graph from the answer and filters unsafe source URLs', async () => {
  await withServer({ apiKey: 'test', clientFactory: fakeClient(sample) }, async url => {
    const response = await post(url, { action: 'create', ...body, sources: [{ id: 1, title: 'Official site', url: 'https://example.com/' }, { id: 2, title: 'Bad', url: 'javascript:alert(1)' }] });
    assert.equal(response.status, 200); const { graph } = await response.json();
    assert.equal(graph.nodes[0].baseline, graph.nodes[0].detail); assert.equal(graph.nodes[0].status, 'baseline');
    assert.deepEqual(graph.originalSources, [{ id: 1, title: 'Official site', url: 'https://example.com/' }]);
    assert.equal(graph.checkedAt, null);
  });
});

test('rechecks against the original baseline and exposes sourced change and inferred impact', async () => {
  const assessments = { assessments: [
    { id: 'hours', status: 'changed', detail: 'Was open to 18:00; now closes at 15:00 [1].', sourceIds: [1], baselineComparable: 'yes', evidenceCertainty: 'confirmed' },
    { id: 'visit', status: 'affected', detail: 'A 16:00 visit may no longer work; consider arriving earlier.', sourceIds: [1], baselineComparable: 'not_applicable', evidenceCertainty: 'not_applicable' },
  ] };
  await withServer({ apiKey: 'test', tavilyKey: 'test', clientFactory: fakeClient(assessments), search: async query => {
    assert.match(query, /Museum Siam Bangkok opening hours/);
    return [{ title: 'Museum hours', url: 'https://example.com/hours', content: 'Open 10:00 to 15:00.' }];
  } }, async url => {
    const response = await post(url, { action: 'check', ...body, graph: sample }); assert.equal(response.status, 200);
    const { graph } = await response.json(); assert.equal(graph.nodes[0].baseline, 'Open 10:00–18:00');
    assert.equal(graph.nodes[0].status, 'changed'); assert.equal(graph.nodes[1].status, 'affected');
    assert.equal(graph.sources[0].url, 'https://example.com/hours'); assert.ok(graph.checkedAt);
  });
});

test('does not report change or unchanged when sources are unavailable or fabricated', async () => {
  const assessments = { assessments: [{ id: 'hours', status: 'changed', detail: 'Invented change', sourceIds: [999], baselineComparable: 'yes', evidenceCertainty: 'confirmed' }, { id: 'visit', status: 'affected', detail: 'Invented impact', sourceIds: [], baselineComparable: 'not_applicable', evidenceCertainty: 'not_applicable' }] };
  for (const search of [async () => [], async () => [{ title: 'Evidence', url: 'https://example.com', content: 'Insufficient evidence.' }]]) {
    await withServer({ apiKey: 'test', tavilyKey: 'test', clientFactory: fakeClient(assessments), search }, async url => {
      const response = await post(url, { action: 'check', ...body, graph: sample }); const { graph } = await response.json();
      assert.deepEqual(graph.nodes.map(node => node.status), ['uncertain', 'uncertain']);
      assert.doesNotMatch(graph.nodes.map(node => node.detail).join(' '), /Invented/);
    });
  }
});

test('fails closed on unknown baselines and conflicting or inconsistent model assessments', async () => {
  const testCases = [
    { baseline: 'The official opening hours could not be verified.', comparable: 'yes', certainty: 'confirmed', detail: 'The museum now closes at 15:00.', reason: /original answer/i },
    { baseline: 'No current hours are known.', comparable: 'yes', certainty: 'confirmed', detail: 'The museum now closes at 15:00.', reason: /original answer/i },
    { baseline: 'Open 10:00–18:00', comparable: 'no', certainty: 'confirmed', detail: 'The museum now closes at 15:00.', reason: /original answer/i },
    { baseline: 'Open 10:00–18:00', comparable: 'yes', certainty: 'conflicting', detail: 'The museum now closes at 15:00.', reason: /conflicting or inconclusive/i },
    { baseline: 'Open 10:00–18:00', comparable: 'yes', certainty: 'confirmed', detail: 'The official sources conflict, so I cannot conclusively confirm the hours.', reason: /conflicting or inconclusive/i },
  ];
  for (const input of testCases) {
    const graph = { ...sample, nodes: [{ ...sample.nodes[0], baseline: input.baseline }, sample.nodes[1]] };
    const result = { assessments: [
      { id: 'hours', status: 'changed', detail: input.detail, sourceIds: [1], baselineComparable: input.comparable, evidenceCertainty: input.certainty },
      { id: 'visit', status: 'affected', detail: 'The proposed visit is affected.', sourceIds: [1], baselineComparable: 'not_applicable', evidenceCertainty: 'not_applicable' },
    ] };
    await withServer({ apiKey: 'test', tavilyKey: 'test', clientFactory: fakeClient(result), search: async () => [{ title: 'Museum', url: 'https://example.com/hours', content: 'Opening hours information.' }] }, async url => {
      const response = await post(url, { action: 'check', ...body, graph });
      assert.equal(response.status, 200);
      const checked = (await response.json()).graph;
      assert.deepEqual(checked.nodes.map(node => node.status), ['uncertain', 'uncertain']);
      assert.match(checked.nodes[0].detail, input.reason);
    });
  }
});

test('rejects cross-origin, malformed graphs, and missing Tavily key', async () => {
  await withServer({ apiKey: 'test', clientFactory: fakeClient(sample) }, async url => {
    assert.equal((await post(url, { action: 'create', ...body }, { origin: 'https://example.com' })).status, 403);
    assert.equal((await post(url, { action: 'check', ...body, graph: { ...sample, edges: [{ from: 'unknown', to: 'visit' }] } })).status, 400);
    assert.equal((await post(url, { action: 'check', ...body, graph: { ...sample, nodes: [null, sample.nodes[1]] } })).status, 400);
    assert.equal((await post(url, { action: 'check', ...body, graph: sample })).status, 503);
  });
});
