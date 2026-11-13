import OpenAI from 'openai';

const defaultBaseURL = 'http://127.0.0.1:8080/openai/v1';

// Keep the local prototype's gateway on loopback: neither prompts nor gateway
// credentials should be sent to an arbitrary remote endpoint by a typo.
export function createBifrostClient(apiKey = 'bifrost-local', baseURL = defaultBaseURL) {
  let url;
  try { url = new URL(baseURL); } catch { throw new Error('Invalid local Bifrost URL.'); }
  if (url.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) ||
      url.username || url.password || url.search || url.hash || url.pathname.replace(/\/$/, '') !== '/openai/v1') {
    throw new Error('Bifrost must use a local /openai/v1 endpoint.');
  }
  return new OpenAI({ apiKey, baseURL: url.href.replace(/\/$/, ''), timeout: 120_000, maxRetries: 0 });
}
