# @growthos/mcp-headless-example

A runnable example of a headless agent that talks to a GrowthOS project over MCP (KAN-78) — connect
with a scoped API key, no human approval step, no OAuth browser flow.

See [`docs/mcp/README.md`](../../docs/mcp/README.md) for the full connection guide (Claude Desktop,
claude.ai, and this headless recipe) and permission/scope requirements.

## Usage as a library

```ts
import { asToolCaller, connectGrowthOsMcpClient, fetchWeeklyMetricDigest } from '@growthos/mcp-headless-example';

const client = await connectGrowthOsMcpClient({
  mcpUrl: 'https://api.growthos.app/v1/mcp',
  bearerToken: process.env.GROWTHOS_MCP_API_KEY!,
});
const digest = await fetchWeeklyMetricDigest(asToolCaller(client), { metric: 'cac' });
await client.close();
```

## Usage as a CLI

```bash
pnpm --filter @growthos/mcp-headless-example build
GROWTHOS_MCP_URL=https://api.growthos.app/v1/mcp \
GROWTHOS_MCP_API_KEY=gos_live_... \
GROWTHOS_MCP_METRIC=cac \
pnpm --filter @growthos/mcp-headless-example start
```
