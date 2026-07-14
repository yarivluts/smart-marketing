#!/usr/bin/env node
import { asToolCaller, connectGrowthOsMcpClient } from './growthos-mcp-client';
import { fetchWeeklyMetricDigest } from './weekly-digest';

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

/**
 * The headless-agent recipe (KAN-78, plan `12 §6`'s own "every Monday my
 * agent pulls last week's CAC and drafts the budget memo" example): connect
 * with a scoped API key, pull a grounded weekly digest for one metric, print
 * it as JSON. Meant to be run from a cron job / CI schedule — see
 * `docs/mcp/README.md` for the full setup recipe.
 */
async function main(): Promise<void> {
  const mcpUrl = process.env.GROWTHOS_MCP_URL ?? 'http://localhost:3001/v1/mcp';
  const bearerToken = requiredEnv('GROWTHOS_MCP_API_KEY');
  const metric = process.env.GROWTHOS_MCP_METRIC ?? 'cac';
  const days = process.env.GROWTHOS_MCP_DAYS ? Number(process.env.GROWTHOS_MCP_DAYS) : undefined;

  const client = await connectGrowthOsMcpClient({ mcpUrl, bearerToken });
  try {
    const digest = await fetchWeeklyMetricDigest(asToolCaller(client), { metric, days });
    console.log(JSON.stringify(digest, null, 2));
  } finally {
    await client.close();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
