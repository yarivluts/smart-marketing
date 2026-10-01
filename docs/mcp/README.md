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
| `query_funnel` | For each step of the project's confirmed funnel, the people who reached it having gone through every earlier step in order (`people_count`, never increasing; a visitor who becomes a customer counts once), with `conversion_rate_from_first` / `conversion_rate_from_previous`, `event_schema_name`, `stage_key` and `step_order`. Steps can be passed straight back to `set_funnel`. The camelCase keys (`eventSchemaName`, `stageKey`, `stepOrder`, `customerCount`, `conversionRateFromFirst`) are deprecated duplicates kept for one release. With no confirmed funnel yet it returns `status: "no_funnel_defined"` and a message pointing to `set_funnel` |
| `search_customers` | Substring search over Customer 360 entity records |
| `validate_records` | Check sample records (`kind`, `records`, and `type` for entities) against the project's registered schemas exactly as ingest would, storing nothing: each record `valid` or `invalid` with the reasons ingest would quarantine it for. Same check as REST `POST /v1/ingest/(events|entities|measures)/validate` |
| `list_insights` | Recent tracking-broke alerts and fired win-rule events |
| `get_setup_health` | Whether each setup requirement (landing-page attribution, signups, product usage, customer entity, billing, ad spend) is `connected`, `error` (only rejected records) or a `gap` in one environment, plus a one-line summary per environment the credential can see. An API key reports only on its own environment; a project-wide OAuth connection can name any with `environment`. Each requirement lists the `schemas` behind its status and `mapping: "inferred_from_schema_name"`, since schemas are matched to requirements by their names. Derived only from accepted and quarantined ingest records; nothing can be marked connected by hand |
| `audit_installation_gaps` | Every requirement not connected in that environment: what was received, `impact_summary`, `satisfied_by`, `connected_in_other_environments` and `how_to_fix` steps naming real pages, ingest endpoints and MCP tools. Billing accepts `subscription_state_change` events from any billing system, not only Stripe. Also returns `customer_coverage` (distinct `properties.customer_id` in the environment's events against customer entity records, from the warehouse) and `customer_backfill` with steps (Backfill panel, then `request_backfill`) when under 90% have a record; without a readable warehouse it falls back to "events accepted, no customer entity ever" and says no count is available |
| `get_ingest_health` | Ingest health per event in one environment (the key's own; OAuth may name one): accepted records per UTC day over `window_days` and in total (`accepted_in_window_is_lower_bound` when the per-event read cap is hit), `last_seen_at`, records still open in quarantine with their reasons, and whether a tracking-broke alert is active; `other_schemas` lists entity/measure schemas and names sent but never registered. Same data as the Ingest health page |

Act tools (each requires its own extra permission, re-checked on every call):

| Tool | Requires | What it does |
| --- | --- | --- |
| `propose_action` | `automation.execute` (OAuth/human only) | Propose a simulated ad-campaign budget change — dry-run diff, never executes by itself |
| `approve_action` | `automation.approve` (OAuth/human only) | Approve an `awaiting_approval` action so it can execute |
| `create_goal` | `dashboards.write` | Create a goal pinning a metric to a target/range and deadline |
| `create_segment` | `dashboards.write` | Save a named customer segment filter definition |
| `apply_schema_manifest` | `schema.write` (a `dry_run: true` preview needs only `mcp.read`) | Register and evolve the project's schemas from one manifest (`schemas: [{ kind, name, fields }]`, each as `register_schema` takes it). Reports per schema `register`, `evolve` (added optional fields or changed flags), `unchanged`, `blocked` (breaking, with reasons) or `invalid`; writes nothing if any schema is blocked or invalid. Schemas missing from the manifest are left alone |
| `set_funnel` | `project.configure` (a `dry_run: true` preview needs only `mcp.read`) | Define or replace the project's confirmed funnel: an ordered list of at least 2 registered event schema names (or `{ event_schema_name, stage_key }` objects; camelCase keys and `query_funnel`'s own step objects are accepted too). Same funnel the web onboarding wizard confirms and the Funnel page charts |

AI Ad Studio tools give an agent the whole studio, using the same engine, limits, rules and audit as the Ad Studio page. They need these permissions:

- `ai.use` for the studio itself.
- `project.configure` for the daily limits.
- `automation.execute` to send anything to an ad platform. Only an OAuth (human) connection can hold it, never an API key.

Rendering takes minutes, so no tool waits for it to finish. Start the work with one tool, then call the status or advance tool repeatedly until it is done.

| Tool | Requires | What it does |
| --- | --- | --- |
| `list_ad_briefs` | `ai.use` | Every ad with how far it has come |
| `get_ad_brief` | `ai.use` | One ad in full: brief, plan, scenes with their video state, image ideas with each placement's images and versions, video progress and the assembled video, the latest autopilot run, exports, and its web link |
| `create_ad_brief` / `update_ad_brief` / `delete_ad_brief` | `ai.use` | Create, change or delete an ad (delete removes its script, ideas, images, clips, videos and runs) |
| `plan_ad_brief` | `ai.use` | Deep plan from the landing page, the project's results and campaigns, and Google Ads search volumes, with recommendations |
| `generate_ad_script` / `save_ad_script` | `ai.use` | Write the video script with AI (3-10 s scenes, at most 60 s) or save an edited one. Hebrew narration gets a `pronunciation` (full nikud, numbers as words) that the video model reads; it is added on save (one AI text call) and redone when the narration changes |
| `rewrite_ad_scene` | `ai.use` | Propose a rewrite of one scene by an instruction; not saved until sent back with `save_ad_script` |
| `write_ad_copy` / `save_ad_copy` | `ai.use` | Write with AI (one call, missing ones by default) or save the ad copy next to each creative: headline (30), primary text (90) and description (90), for the video and every image idea; null clears one |
| `list_ad_references` | `ai.use` | The ad's reference images (app screenshots, AI illustrations) and whether illustrations can be drawn |
| `add_ad_reference` | `ai.use` | Add a reference image: upload a PNG/JPEG (base64), e.g. a sharp screenshot of the real app, or draw an illustration (counts as an image) |
| `get_ad_reference` / `delete_ad_reference` | `ai.use` | Look at a reference image, or delete it (it is removed from every scene). Scenes attach up to 3 images with `save_ad_script` (`references`: screen, subject or first_frame), and the video model gets them with the scene prompt |
| `generate_ad_image_ideas` / `save_ad_image_ideas` | `ai.use` | Write image ad ideas with AI (optionally for chosen placements) or save edited ones |
| `render_ad_image` | `ai.use` | Render one idea in one placement (square, portrait, story, landscape) with Gemini 3.1 Flash Image |
| `edit_ad_image` | `ai.use` | Change a finished image by an instruction; the result is a new, selected version |
| `select_ad_image` | `ai.use` | Pick which version of an idea's placement is used |
| `get_ad_image` | `ai.use` | The image itself (MCP image content) with its details |
| `render_ad_video` / `render_ad_scene` / `edit_ad_scene_clip` | `ai.use` | Start Gemini Omni clips for every stale scene, for one scene, or as an edit of a scene's clip |
| `get_ad_video_status` | `ai.use` | Move rendering clips along, run the AI quality check of ready clips (one per call), and return each scene's state and `qa` verdict (`passed`, `issues` with what was heard and each problem, `skipped`, `error`); poll while generating or until every clip is checked |
| `assemble_ad_video` | `ai.use` | Join the current clips into the finished video |
| `start_ad_autopilot` | `ai.use` | Plan -> script -> image ideas -> (person confirms) -> images -> clips -> assembled video, each only if missing; keeps anything existing or edited. `confirm_plan` (default true) stops at `awaiting_approval` before rendering |
| `advance_ad_autopilot` | `ai.use` | Do the next unit of a run; call again until `status` is not `running` |
| `approve_ad_plan` | `ai.use` | Confirm a run waiting at `awaiting_approval` so it renders the images and video - only after the person said to go ahead |
| `get_ad_autopilot` / `cancel_ad_autopilot` | `ai.use` | Read a run without advancing it, or stop it (a waiting plan included) |
| `list_ad_export_destinations` | `ai.use` | Where creatives can go (Meta, YouTube, Google Ads) and why not where they cannot |
| `export_ad_video` | `automation.execute` (OAuth/human only) | Upload the assembled video to the Meta ad account or the YouTube channel |
| `export_ad_image` | `automation.execute` (OAuth/human only) | Upload an image to Meta's ad image library or as a Google Ads image asset |
| `publish_ad` | `automation.execute` (OAuth/human only) | Create a real, PAUSED ad from an image or the video: Meta campaign + ad set + creative + ad, or a Google Display campaign + responsive display ad (images). Returns the link to the ad |
| `get_ad_studio_usage` | `ai.use` | Daily limits, today's usage, which models are configured, and the clip quality-check setting |
| `set_ad_studio_limits` | `project.configure` | Set the daily limits for AI text calls, video seconds and images, and the clip quality check (`video_qa_enabled`, `video_qa_retries` 0-2) |

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
