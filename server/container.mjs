import { mkdir, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { connect } from 'node:net';
import { createProductionServer } from './production.mjs';

// Keep the gateway private to this container. Configuration contains an env
// reference, never the provider key itself, and disables persistent logging.
if (!process.env.OPENAI_API_KEY || !process.env.TAVILY_API_KEY) {
  throw new Error('OPENAI_API_KEY and TAVILY_API_KEY must be configured.');
}
const dir = '/tmp/nowchat-bifrost';
await mkdir(dir, { recursive: true });
await writeFile(`${dir}/config.json`, JSON.stringify({
  config_store: { enabled: false }, logs_store: { enabled: false },
  client: { enable_logging: false, disable_content_logging: true },
  providers: { openai: { keys: [{ name: 'nowchat-openai', value: 'env.OPENAI_API_KEY', models: ['*'], weight: 1 }] } },
}));
const gatewayPort = 19580;
const gateway = spawn('/usr/local/bin/bifrost', ['-host', '127.0.0.1', '-port', String(gatewayPort), '-app-dir', dir, '-log-level', 'error'], { stdio: ['ignore', 'ignore', 'inherit'] });
let gatewayExited = false;
gateway.on('exit', () => { gatewayExited = true; });
gateway.on('error', () => { gatewayExited = true; });
let ready = false;
for (let attempt = 0; attempt < 150 && !gatewayExited && !ready; attempt++) {
  ready = await new Promise(resolve => {
    const socket = connect(gatewayPort, '127.0.0.1');
    socket.on('connect', () => { socket.destroy(); resolve(true); });
    socket.on('error', () => resolve(false));
  });
  if (!ready) await new Promise(resolve => setTimeout(resolve, 200));
}
if (!ready) { gateway.kill(); throw new Error('Bifrost could not start.'); }
const server = createProductionServer({ distDir: '/app/dist', tavilyKey: process.env.TAVILY_API_KEY });
server.listen(Number(process.env.PORT) || 80, '0.0.0.0');
gateway.on('exit', () => { server.close(); process.exitCode = 1; });
for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => {
  server.close(); gateway.kill('SIGTERM');
});
