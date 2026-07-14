import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { ToolCaller } from './weekly-digest';

export interface ConnectOptions {
  /** GrowthOS's MCP Streamable HTTP endpoint, e.g. `https://api.growthos.app/v1/mcp` (or `http://localhost:3001/v1/mcp` in local dev). */
  mcpUrl: string;
  /** A scoped API key (`mcp.read` scope, minted on the project Keys page) or an MCP OAuth access token. */
  bearerToken: string;
  clientName?: string;
  clientVersion?: string;
}

/**
 * Connects the real `@modelcontextprotocol/sdk` client to a GrowthOS
 * project's MCP server the same way `apps/api`'s own e2e suite
 * (`mcp.controller.e2e.spec.ts`) does — a bearer credential in the
 * `Authorization` header, no session cookie, no cookie jar. GrowthOS's MCP
 * server is stateless (a fresh server per HTTP request — see
 * `apps/api/src/mcp/mcp.controller.ts`), so `StreamableHTTPClientTransport`
 * needs no session-id handling beyond what the SDK already does by default.
 */
export async function connectGrowthOsMcpClient(options: ConnectOptions): Promise<Client> {
  const client = new Client({
    name: options.clientName ?? 'growthos-headless-agent-example',
    version: options.clientVersion ?? '1.0.0',
  });
  const transport = new StreamableHTTPClientTransport(new URL(options.mcpUrl), {
    requestInit: { headers: { Authorization: `Bearer ${options.bearerToken}` } },
  });
  await client.connect(transport);
  return client;
}

/**
 * Adapts a real SDK `Client` to {@link ToolCaller}, the narrow shape
 * `fetchWeeklyMetricDigest`/`callGrowthOsTool` (`weekly-digest.ts`) actually
 * need. `Client.callTool`'s own return type is a wider union (it also
 * covers a legacy/compatibility result shape with no `content` field at
 * all) that a structural match against `ToolCaller` can't narrow at compile
 * time — the same reason `mcp.controller.e2e.spec.ts` casts `result.content`
 * itself when calling tools directly. Every GrowthOS tool always replies
 * with the `{ content: [...], isError? }` shape (see `textResult`/
 * `errorResult` in `apps/api/src/mcp/mcp-tools.ts`), so this cast reflects
 * a real runtime guarantee, not a hopeful one.
 */
export function asToolCaller(client: Pick<Client, 'callTool'>): ToolCaller {
  return {
    async callTool(params) {
      const result = await client.callTool(params);
      return result as unknown as { content: Array<{ type: string; text?: string }>; isError?: boolean };
    },
  };
}
