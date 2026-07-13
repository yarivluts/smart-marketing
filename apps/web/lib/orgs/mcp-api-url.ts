const DEFAULT_MCP_API_URL = 'http://localhost:3001/v1/mcp';

/**
 * GrowthOS's MCP (Model Context Protocol) Streamable HTTP endpoint (KAN-75),
 * for display on the project Keys page. Mirrors `ingestApiUrl()`'s own
 * "`NEXT_PUBLIC_*` env var with a `localhost` dev default" convention — the
 * endpoint URL isn't a secret (the bearer credential presented to it is),
 * so it's safe to inline into the client bundle.
 */
export function mcpApiUrl(): string {
  return process.env.NEXT_PUBLIC_MCP_API_URL ?? DEFAULT_MCP_API_URL;
}
