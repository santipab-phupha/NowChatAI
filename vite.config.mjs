import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { createChatHandler } from './server/chat.mjs';
import { createFollowupHandler } from './server/followup.mjs';
import { createBifrostClient } from './server/bifrost.mjs';

export default defineConfig(({ mode }) => {
  // Unprefixed values stay on the server. They are never passed to client code.
  const env = loadEnv(mode, process.cwd(), '');
  const gatewayKey = env.BIFROST_API_KEY || 'bifrost-local';
  const clientFactory = key => createBifrostClient(key, env.BIFROST_BASE_URL || undefined);
  const chat = createChatHandler({ apiKey: gatewayKey, tavilyKey: env.TAVILY_API_KEY, clientFactory });
  const followup = createFollowupHandler({ apiKey: gatewayKey, tavilyKey: env.TAVILY_API_KEY, clientFactory });
  const install = server => { server.middlewares.use('/api/chat', chat); server.middlewares.use('/api/followup', followup); };
  return { plugins: [react(), { name: 'nowchatai-api', configureServer: install, configurePreviewServer: install }] };
});
