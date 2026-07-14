# Connect to GrowthOS over MCP

GrowthOS ships a first-party [MCP](https://modelcontextprotocol.io) (Model Context Protocol) server
(plan [`12 §6`](../plan/12-api-reference.md)) so any MCP client — Claude Desktop, claude.ai
connectors, IDEs, or a headless agent you write yourself — can query a project's metrics, customers,
and insights, and (with the right permission) create goals/segments or propose automation changes, in
natural language.

This doc gets a new client connected in under 10 minutes. Pick the section for your client:

- [Claude Desktop](#claude-desktop)
- [claude.ai custom connector](#claiai-custom-connector)
- [Headless agent (API key, no human in the loop)](#headless-agent-recipe)

A runnable headless-agent example lives in
[`packages/mcp-headless-example`](../../packages/mcp-headless-example) — see
[Headless agent recipe](#headless-agent-recipe) below.

## Before you start

- **Endpoint**: `POST {GROWTHOS_API_BASE_URL}/v1/mcp` — a single flat URL, e.g.
  `https://api.growthos.app/v1/mcp` in production or `http://localhost:3001/v1/mcp` in local dev
  (`pnpm dev`). Unlike the plan doc's original `/{org}/{project}` sketch, the actual server resolves
  your org/project from the credential you authenticate with, not from the URL — **one server scope
  per project**, enforced by the credential rather than a path segment (see
  `apps/api/src/mcp/mcp.controller.ts`'s own doc comment for why).
- **You need `mcp.read`** on at least one org/project to connect at all — ask an org owner/admin to
  grant you a role that carries it, or mint a scoped API key (below).
- The server is **stateless** — every request re-authenticates from scratch. `GET`/`DELETE` aren't
  supported (405); only `POST` (the MCP Streamable HTTP transport).

Two credential kinds work, matching plan `12 §6.1`:

| Credential | Best for | Where |
| --- | --- | --- |
| OAuth 2.1 (authorization-code + PKCE) | Interactive clients — Claude Desktop, claude.ai, a human at a terminal | Your org's login+consent screen; no secret to copy anywhere |
| Scoped API key (`mcp.read`, `+dashboards.write` for `create_goal`/`create_segment`) | Headless agents, cron jobs, CI | Project → **Keys** page (`/orgs/:orgId/projects/:projectId/keys`) → mint a key with the scopes you need |

Automation act tools (`propose_action`/`approve_action`) always require **`automation.execute`** /
**`automation.approve`**, and those two permissions can never be granted to an API key (see
`packages/shared/src/policy/api-key-scopes.ts`) — they need a real human role, by design (plan
`06 §3`: "automation execution rights are a separate, elevated scope"). Use the OAuth flow for those
two tools; API keys work fine for every read tool plus `create_goal`/`create_segment`.

## Claude Desktop

Claude Desktop discovers OAuth automatically from GrowthOS's own metadata endpoints
(`/.well-known/oauth-authorization-server`, `/.well-known/oauth-protected-resource`) — you don't
register a client or handle tokens by hand.

1. Open Claude Desktop → **Settings → Connectors → Add custom connector**.
2. Enter the MCP endpoint URL: `https://api.growthos.app/v1/mcp` (or your own deployment's API base
   URL + `/v1/mcp`).
3. Claude Desktop opens your browser to GrowthOS's login+consent page. Sign in, pick the org/project
   to connect (only ones where you hold `mcp.read` are offered), and approve.
4. You're returned to Claude Desktop with the connector active — the `growthos` tools show up in your
   next conversation.

If you're on an older Claude Desktop build without native remote-connector support, or you'd rather
connect with a scoped API key instead of your own human OAuth grant, use the
[`mcp-remote`](https://www.npmjs.com/package/mcp-remote) bridge and edit
`claude_desktop_config.json` directly — see
[`claude-desktop-config.api-key.example.json`](./claude-desktop-config.api-key.example.json):

```json
{
  "mcpServers": {
    "growthos": {
      "command": "npx",
      "args": [
        "-y",
        "mcp-remote",
        "https://api.growthos.app/v1/mcp",
        "--header",
        "Authorization:Bearer ${GROWTHOS_MCP_API_KEY}"
      ],
      "env": {
        "GROWTHOS_MCP_API_KEY": "gos_live_..."
      }
    }
  }
}
```

Restart Claude Desktop after editing the config file. See
[`claude-desktop-config.oauth.example.json`](./claude-desktop-config.oauth.example.json) for the
equivalent config-file form of the native OAuth flow (useful if your Desktop build supports remote
servers in the config file but not yet the Connectors UI).

## claude.ai custom connector

1. In claude.ai, open **Settings → Connectors → Add custom connector**.
2. Paste the MCP endpoint URL (`https://api.growthos.app/v1/mcp`) and confirm.
3. claude.ai redirects you to GrowthOS's login+consent page (the same one Claude Desktop uses) — sign
   in, pick an org/project, approve.
4. The connector is now available to attach to any conversation.

Revoke access any time from the project's **Keys** page (`MCP connections` section) — revoking there
takes effect on the connector's very next tool call, since every OAuth-authenticated call re-checks
your current role bindings rather than trusting the original grant.

## Headless-agent recipe

For a cron job, CI step, or your own agent framework with no human clicking "approve" each time, use a
scoped API key instead of OAuth:

1. Project → **Keys** page → mint a key with the `mcp.read` scope (add `dashboards.write` too if your
   agent should be able to call `create_goal`/`create_segment`).
2. Store the raw key (shown once) as a secret — e.g. `GROWTHOS_MCP_API_KEY`.
3. Send every request with `Authorization: Bearer <key>`.

The MCP wire protocol is just JSON-RPC 2.0 over HTTP POST, so any HTTP client works, but the
recommended path is the official `@modelcontextprotocol/sdk` client — the same one
`apps/api/src/mcp/mcp.controller.e2e.spec.ts` uses to test this server end to end. A complete, tested
example lives in [`packages/mcp-headless-example`](../../packages/mcp-headless-example):

```ts
import { asToolCaller, connectGrowthOsMcpClient, fetchWeeklyMetricDigest } from '@growthos/mcp-headless-example';

const client = await connectGrowthOsMcpClient({
  mcpUrl: 'https://api.growthos.app/v1/mcp',
  bearerToken: process.env.GROWTHOS_MCP_API_KEY!,
});

// plan `12 §6`'s own example: "every Monday my agent pulls last week's CAC ..."
const digest = await fetchWeeklyMetricDigest(asToolCaller(client), { metric: 'cac' });
console.log(digest); // { metric, rangeStart, rangeEnd, series, definitionRefs }

await client.close();
```

Run the same recipe as a standalone CLI, no code required:

```bash
pnpm --filter @growthos/mcp-headless-example build
GROWTHOS_MCP_URL=https://api.growthos.app/v1/mcp \
GROWTHOS_MCP_API_KEY=gos_live_... \
GROWTHOS_MCP_METRIC=cac \
pnpm --filter @growthos/mcp-headless-example start
```

`GROWTHOS_MCP_URL` defaults to `http://localhost:3001/v1/mcp` (local dev); `GROWTHOS_MCP_METRIC`
defaults to `cac`; `GROWTHOS_MCP_DAYS` defaults to `7`.

## Tool reference

Read tools (need only the connection-level `mcp.read`):

| Tool | What it does |
| --- | --- |
| `list_metrics` | List every metric registered in the project's active catalog, with lineage |
| `describe_metric` | Full definition of one metric by name |
| `query_metric` | Grounded query over one or more metrics for a date range — never generated numbers |
| `compare_periods` | Same as `query_metric` plus a period-over-period comparison |
| `decompose` | Same as `query_metric` broken down by one or more dimensions |
| `query_cohort` | Signup-month × period-number retention matrix |
| `search_customers` | Substring search over Customer 360 entity records |
| `list_insights` | Recent tracking-broke alerts and fired win-rule events |

Act tools (each requires its own extra permission, re-checked on every call):

| Tool | Requires | What it does |
| --- | --- | --- |
| `propose_action` | `automation.execute` (OAuth/human only) | Propose a simulated ad-campaign budget change — dry-run diff, never executes by itself |
| `approve_action` | `automation.approve` (OAuth/human only) | Approve an `awaiting_approval` action so it can execute |
| `create_goal` | `dashboards.write` | Create a goal pinning a metric to a target/range and deadline |
| `create_segment` | `dashboards.write` | Save a named customer segment filter definition |

`query_funnel` from the original plan sketch isn't built yet — no `fact_funnel_*` dbt model exists;
tracked as a follow-up.

## Safety & limits

- Every call is scoped to exactly one org/project — a credential bound to project A cannot see or
  enumerate project B (the same isolation property the ingest/metrics REST APIs already hold, covered
  by the same isolation test suite).
- Every tool call — success, tool-level error, or a thrown exception — lands in the org's audit log
  with both the *principal* (who/what authenticated) and the *client identity* (which OAuth
  application, or which API key).
- Each connection (API key or OAuth grant) has its own rate budget — 2 requests/second sustained, burst
  120. Exceeding it returns HTTP 429 with a `Retry-After` header; back off and retry.
- `propose_action` never executes anything by itself — every guardrail from the automation policy
  engine still applies, and execution requires a separate `approve_action` call from a permission
  holder. Chatting from an MCP client never bypasses the human-in-the-loop.

## Troubleshooting

| Symptom | Cause |
| --- | --- |
| `401 Unauthorized` | Missing or malformed `Authorization: Bearer ...` header, or the credential doesn't exist/was revoked |
| `403 Forbidden` on connect | Your API key lacks the `mcp.read` scope, or (OAuth) you no longer hold `mcp.read` in the granted project |
| A specific act tool returns an error result (not an HTTP error) with "does not currently hold ..." | You (or your API key) lack that tool's specific permission — see the [tool reference](#tool-reference) table |
| `429 Too Many Requests` | You've exceeded this connection's rate budget — check `Retry-After` and back off |
| `405 Method Not Allowed` on `GET`/`DELETE` | Expected — this server is stateless and only supports `POST` |
