// Runs every sample in the public developer area (/developers), exactly as the guides render it,
// against a TEST environment of a deployed GrowthOS (KAN-378). A green run means a developer who
// copies the guides step by step gets a working integration.
//
//   pnpm --filter @growthos/web validate:guides
//
// Keys: GROWTHOS_GUIDE_SERVER_KEY (gos_test_..., scopes ingest.write, schema.write, mcp.read,
// metrics.write) and GROWTHOS_GUIDE_BROWSER_KEY (gos_pk_test_..., allowed origin
// http://localhost:4599). When unset they are read from Secret Manager
// (growthos-dev-sandbox-server-key / growthos-dev-sandbox-browser-key). Live keys are refused.
// Keys reach child processes only through GROWTHOS_API_KEY and are never printed.
//
// Targets: GUIDE_API_BASE and GUIDE_APP_BASE (default: production, where the sandbox org lives).
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const shared = require('@growthos/shared');
const { chromium } = require('@playwright/test');

const API = (process.env.GUIDE_API_BASE || 'https://api-prod-1098891924957.me-west1.run.app').replace(/\/+$/, '');
const APP = (process.env.GUIDE_APP_BASE || 'https://web-prod-1098891924957.me-west1.run.app').replace(/\/+$/, '');
const nodeSdkVersion = JSON.parse(fs.readFileSync(path.join(__dirname, '../../../packages/sdk-node/package.json'), 'utf8')).version;
const BROWSER_PORT = 4599;

const results = [];
// The logs can be public (CI), so even a key's display prefix is masked.
const redact = (text) => text.replace(/gos_(pk_)?(test|live)_[A-Za-z0-9_-]+(\.\.\.)?/g, 'gos_$1$2_[redacted]');
const record = (step, ok, detail) => {
  results.push({ step, ok });
  console.log(redact(`${ok ? 'PASS' : 'FAIL'}  ${step}  ${typeof detail === 'string' ? detail : JSON.stringify(detail)}`).slice(0, 600));
};

function secret(envName, secretName) {
  if (process.env[envName]) return process.env[envName].trim();
  const gcloud = process.platform === 'win32' ? 'gcloud.cmd' : 'gcloud';
  const out = spawnSync(gcloud, ['secrets', 'versions', 'access', 'latest', `--secret=${secretName}`, '--project', 'growthos-g2w84'], {
    encoding: 'utf8',
    shell: process.platform === 'win32',
  });
  if (out.status !== 0 || !out.stdout.trim()) throw new Error(`set ${envName}, or allow reading the ${secretName} secret`);
  return out.stdout.trim();
}
const SERVER_KEY = secret('GROWTHOS_GUIDE_SERVER_KEY', 'growthos-dev-sandbox-server-key');
const BROWSER_KEY = secret('GROWTHOS_GUIDE_BROWSER_KEY', 'growthos-dev-sandbox-browser-key');
if (!SERVER_KEY.startsWith('gos_test_') || !BROWSER_KEY.startsWith('gos_pk_test_')) {
  throw new Error('the guide check only runs with TEST keys (gos_test_ / gos_pk_test_)');
}
const env = { ...process.env, GROWTHOS_API_KEY: SERVER_KEY };
delete env.GROWTHOS_GUIDE_SERVER_KEY;
delete env.GROWTHOS_GUIDE_BROWSER_KEY;

/** Runs a sample shell command with the key in the environment; parses JSON or one SSE data line. */
function runShell(command) {
  const out = spawnSync('bash', ['-c', command], { env, encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 });
  const text = (out.stdout || '').trim();
  const dataLine = text.split('\n').find((line) => line.startsWith('data: '));
  try {
    return JSON.parse(dataLine ? dataLine.slice(6) : text);
  } catch {
    return { raw: text.slice(0, 400), stderr: (out.stderr || '').slice(0, 300) };
  }
}
const toolText = (rpc) => rpc?.result?.content?.map((part) => part.text).join('\n') ?? JSON.stringify(rpc).slice(0, 300);

async function main() {
  // @growthos/browser is ESM-only.
  const { installSnippet, SDK_VERSION: browserSdkVersion } = await import('@growthos/browser');
  const ctx = { apiBase: API, appBase: APP, nodeSdkVersion, browserSdkVersion };

  // 1. Register the guide's schemas through MCP (quick start, step 2).
  const manifest = runShell(shared.curlApplySchemaManifest(ctx));
  record('mcp apply_schema_manifest', !manifest.error && !manifest.result?.isError, toolText(manifest).slice(0, 400));

  // 2. HTTP ingest: events, entities, measures (API guide). Re-runs come back as duplicates.
  for (const kind of ['events', 'entities', 'measures']) {
    const res = runShell(shared.curlIngest(ctx, kind));
    record(`http ingest ${kind}`, (res.accepted ?? 0) + (res.duplicates ?? 0) > 0 && (res.quarantined ?? 0) === 0, {
      accepted: res.accepted,
      duplicates: res.duplicates,
      quarantined: res.quarantined,
      raw: res.raw,
    });
  }

  // 3. Node SDK from the versioned tarball (server-side guide).
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'growthos-guide-'));
  try {
    fs.writeFileSync(path.join(work, 'package.json'), JSON.stringify({ name: 'guide-check', private: true, type: 'module' }));
    const install = spawnSync('bash', ['-c', `${shared.nodeInstall(ctx)} @modelcontextprotocol/sdk --no-audit --no-fund --silent`], {
      cwd: work,
      encoding: 'utf8',
    });
    record('node sdk install (versioned tarball)', install.status === 0, (install.stderr || '').slice(0, 300) || 'installed');
    fs.writeFileSync(path.join(work, 'server.mjs'), shared.nodeServerSample(ctx));
    const node = spawnSync('node', ['server.mjs'], { cwd: work, env, encoding: 'utf8' });
    record('node sdk sample', node.status === 0 && /quarantined: 0/.test(node.stdout) && /^ok$/m.test(node.stdout), (node.stdout + node.stderr).slice(0, 500));

    // 4. Relay (client-side guide, strict CSP): the sample's handler, called with a browser-SDK batch.
    const relayCode = shared
      .relaySample(ctx)
      .split('\n')
      .filter((line) => !line.startsWith('//'))
      .join('\n')
      .replace('process.env.GROWTHOS_API_KEY!', 'process.env.GROWTHOS_API_KEY');
    fs.writeFileSync(
      path.join(work, 'relay.mjs'),
      `${relayCode}
const response = await POST(new Request('http://localhost/api/growth', { method: 'POST', headers: { 'content-type': 'text/plain' },
  body: JSON.stringify({ batch: [{ event_id: 'relay-' + Date.now(), event: 'cta_click', ts: new Date().toISOString(), properties: { cta: 'relay_check', anon_id: 'anon_relay0001' } }] }) }));
console.log(response.status, await response.text());`,
    );
    const relay = spawnSync('node', ['relay.mjs'], { cwd: work, env, encoding: 'utf8' });
    record('relay sample (@growthos/node/relay)', relay.status === 0 && /^202 .*"accepted":1/.test(relay.stdout.trim()), (relay.stdout + relay.stderr).slice(0, 300));

    // 5. Browser: the install snippet on a real page (localhost is an allowed origin of the test key).
    const page = `<!doctype html><html><head><meta charset="utf-8">${installSnippet({ key: BROWSER_KEY, api: API, scriptUrl: `${APP}/sdk/v1/growthos.js` })}</head><body>guide check</body></html>`;
    const server = http
      .createServer((_, res) => {
        res.writeHead(200, { 'content-type': 'text/html' });
        res.end(page);
      })
      .listen(BROWSER_PORT);
    const browser = await chromium.launch();
    try {
      const tab = await browser.newPage();
      const warnings = [];
      tab.on('console', (message) => {
        if (message.type() === 'warning' || message.type() === 'error') warnings.push(message.text().slice(0, 200));
      });
      await tab.goto(`http://localhost:${BROWSER_PORT}/?utm_source=docs&utm_medium=guide&utm_campaign=dev-guides-check`);
      await tab.waitForFunction(() => window.GrowthOS && typeof window.GrowthOS.getAnonId === 'function' && window.GrowthOS.getAnonId(), null, {
        timeout: 30000,
      });
      await tab.evaluate(() => window.GrowthOS.track('cta_click', { cta: 'hero_signup' }));
      const flushed = await tab.evaluate(() => window.GrowthOS.flush());
      const verify = await tab.evaluate(() => window.GrowthOS.verify(['touchpoint', 'cta_click']));
      const statuses = verify?.report?.schemas?.map((schema) => `${schema.name}:${schema.status}`).join(', ');
      record('browser snippet + track + verify()', Boolean(statuses?.includes('touchpoint:receiving') && statuses.includes('cta_click:receiving')), {
        statuses,
        flushed,
        warnings,
      });
    } finally {
      await browser.close();
      server.close();
    }

    // 6. MCP: tools/list over curl, then the headless TypeScript sample (MCP guide).
    const list = runShell(shared.curlMcp(ctx, 'tools/list'));
    const toolNames = list?.result?.tools?.map((tool) => tool.name) ?? [];
    record('mcp tools/list (curl)', toolNames.includes('check_installation'), `${toolNames.length} tools`);
    fs.writeFileSync(path.join(work, 'agent.mjs'), shared.mcpHeadlessSample(ctx));
    const agent = spawnSync('node', ['agent.mjs'], { cwd: work, env, encoding: 'utf8' });
    record('mcp headless sample', agent.status === 0 && /check_installation/.test(agent.stdout), (agent.stdout + agent.stderr).slice(0, 500));

    // 7. The install check over HTTP and the CLI (testing guide).
    const verify = runShell(shared.curlVerify(ctx));
    const verifyStatuses = verify?.report?.schemas?.map((schema) => `${schema.name}:${schema.status}`) ?? [];
    record('http verify', verify?.report?.status === 'ok', verifyStatuses.join(', ') || verify);
    const cli = spawnSync('bash', ['-c', shared.nodeVerifyCli(ctx).replace(/^GROWTHOS_API_KEY=\S+ /, '')], { cwd: work, env, encoding: 'utf8' });
    record('verify CLI', cli.status === 0, (cli.stdout + cli.stderr).slice(0, 500));
  } finally {
    fs.rmSync(work, { recursive: true, force: true });
  }

  // 8. Metrics read API (API guide): register the guide's metric, list the catalog, run the query.
  const registered = runShell(shared.curlRegisterMetric(ctx));
  const registeredText = toolText(registered);
  record('mcp register_metric', !registered.error && (!registered.result?.isError || /already/i.test(registeredText)), registeredText.slice(0, 300));
  const catalog = runShell(`curl -sS ${API}/v1/metrics -H "Authorization: Bearer $GROWTHOS_API_KEY"`);
  record('metrics catalog', Array.isArray(catalog.metrics), `${catalog.metrics?.length ?? 0} metrics`);
  const query = runShell(shared.curlMetrics(ctx).split('\n\n')[1]);
  record('metrics query', Array.isArray(query.series), JSON.stringify(query).slice(0, 300));

  const failed = results.filter((result) => !result.ok).map((result) => result.step);
  console.log(`\n${results.length - failed.length}/${results.length} passed${failed.length ? ` - failed: ${failed.join(', ')}` : ''}`);
  return failed.length ? 1 : 0;
}

main().then(
  (code) => process.exit(code),
  (error) => {
    console.error('guide check crashed:', error && error.message);
    process.exit(2);
  },
);
