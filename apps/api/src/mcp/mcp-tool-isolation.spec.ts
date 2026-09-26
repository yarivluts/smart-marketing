import { readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * KAN-77 AC: "MCP surface added to the isolation test suite (E1.6)". The MCP surface is a single
 * `POST /v1/mcp` route, not one `route.ts`/controller-method per resource the way
 * `route-isolation-guard.test.ts` (apps/web, KAN-26) scans — so a filesystem scan for that route
 * would only ever find one file, gated by one guard, telling you nothing about the tools dispatched
 * *inside* it. The equivalent guardrail here is a maintained inventory of every `server.registerTool`
 * call name in `mcp-tools.ts`/`mcp-act-tools.ts`, each mapped to the gate that gives it isolation:
 * every read tool is gated once, at connection time, by `McpAuthGuard`'s `mcp.read` check (which
 * resolves org/project from the credential itself, never from a tool argument — see
 * `mcp-auth.guard.ts`); every act tool additionally requires its own specific permission, checked
 * fresh per call by `mcpCallerHasPermission` (`mcp-act-authorization.ts`).
 *
 * This test fails the moment a new tool is registered in either file without a matching entry here —
 * the same "no new endpoint without a registered isolation test" rule `route-isolation-guard.test.ts`
 * enforces for apps/web, applied to MCP's tool-registry shape instead of its route-file shape. Adding
 * a tool: add it to `EXPECTED_TOOLS` below with its gate, and add an isolation-relevant scenario to
 * `mcp.controller.e2e.spec.ts` (see that file's own "cross-project isolation" describe block).
 */

type ToolGate =
  | { kind: 'connection-scope'; permission: 'mcp.read' }
  | { kind: 'per-call-permission'; permission: string }
  /** A tool whose required permission depends on what the call does — see `register_schema` (KAN-175). */
  | { kind: 'per-call-permission-varies'; writePermission: string; readOnlyPermission: 'mcp.read'; readOnlyWhen: string };

const EXPECTED_TOOLS: Record<string, ToolGate> = {
  list_metrics: { kind: 'connection-scope', permission: 'mcp.read' },
  describe_metric: { kind: 'connection-scope', permission: 'mcp.read' },
  query_metric: { kind: 'connection-scope', permission: 'mcp.read' },
  compare_periods: { kind: 'connection-scope', permission: 'mcp.read' },
  decompose: { kind: 'connection-scope', permission: 'mcp.read' },
  query_cohort: { kind: 'connection-scope', permission: 'mcp.read' },
  query_funnel: { kind: 'connection-scope', permission: 'mcp.read' },
  search_customers: { kind: 'connection-scope', permission: 'mcp.read' },
  // KAN-202 I3: reads only the caller project's schema registry and writes nothing.
  validate_records: { kind: 'connection-scope', permission: 'mcp.read' },
  list_insights: { kind: 'connection-scope', permission: 'mcp.read' },
  list_segments: { kind: 'connection-scope', permission: 'mcp.read' },
  list_win_rules: { kind: 'connection-scope', permission: 'mcp.read' },
  propose_action: { kind: 'per-call-permission', permission: 'automation.execute' },
  approve_action: { kind: 'per-call-permission', permission: 'automation.approve' },
  create_goal: { kind: 'per-call-permission', permission: 'dashboards.write' },
  create_segment: { kind: 'per-call-permission', permission: 'dashboards.write' },
  // The self-service administration surface (`mcp-admin-tools.ts`): every operation a
  // GrowthOS engineer used to have to run on a customer's behalf.
  list_warehouse_tables: { kind: 'connection-scope', permission: 'mcp.read' },
  list_schemas: { kind: 'connection-scope', permission: 'mcp.read' },
  list_hook_endpoints: { kind: 'connection-scope', permission: 'mcp.read' },
  list_metric_versions: { kind: 'connection-scope', permission: 'mcp.read' },
  list_goals: { kind: 'connection-scope', permission: 'mcp.read' },
  get_goal_progress: { kind: 'connection-scope', permission: 'mcp.read' },
  delete_goal: { kind: 'per-call-permission', permission: 'dashboards.write' },
  // Dual-gated: a dry run writes nothing and needs only `mcp.read`, so the
  // preview is reachable by someone deciding whether to ask for write access.
  register_schema: { kind: 'per-call-permission-varies', writePermission: 'schema.write', readOnlyPermission: 'mcp.read', readOnlyWhen: 'dry_run === true' },
  evolve_schema: { kind: 'per-call-permission', permission: 'schema.write' },
  // KAN-202 I2: same dry-run split as register_schema; writes only the caller's own project's registry.
  apply_schema_manifest: { kind: 'per-call-permission-varies', writePermission: 'schema.write', readOnlyPermission: 'mcp.read', readOnlyWhen: 'dry_run === true' },
  register_metric: { kind: 'per-call-permission', permission: 'metrics.write' },
  evolve_metric: { kind: 'per-call-permission', permission: 'metrics.write' },
  archive_metric: { kind: 'per-call-permission', permission: 'metrics.write' },
  set_goal_status: { kind: 'per-call-permission', permission: 'dashboards.write' },
  update_project_settings: { kind: 'per-call-permission', permission: 'project.configure' },
  archive_project: { kind: 'per-call-permission', permission: 'project.configure' },
  // KAN-199: same dry-run split as register_schema. Writes only the caller's own project's
  // funnel, validated against that project's own schema registry.
  set_funnel: { kind: 'per-call-permission-varies', writePermission: 'project.configure', readOnlyPermission: 'mcp.read', readOnlyWhen: 'dry_run === true' },
  create_hook_endpoint: { kind: 'per-call-permission', permission: 'ingest.write' },
  set_hook_signing_secret: { kind: 'per-call-permission', permission: 'ingest.write' },
  reexport_raw_records: { kind: 'per-call-permission', permission: 'ingest.write' },
  purge_project_data: { kind: 'per-call-permission', permission: 'ingest.write' },
  // KAN-197 integrator setup tools (`mcp-setup-tools.ts`): read-only, derived from the credential's
  // own project's ingest records.
  get_setup_health: { kind: 'connection-scope', permission: 'mcp.read' },
  audit_installation_gaps: { kind: 'connection-scope', permission: 'mcp.read' },
};

const TOOL_FILES = ['mcp-tools.ts', 'mcp-act-tools.ts', 'mcp-admin-tools.ts', 'mcp-setup-tools.ts'];

function readToolFile(name: string): string {
  return readFileSync(path.join(__dirname, name), 'utf8');
}

function findRegisteredToolNames(source: string): string[] {
  const names: string[] = [];
  const pattern = /server\.registerTool\(\s*'([^']+)'/g;
  for (const match of source.matchAll(pattern)) {
    names.push(match[1]);
  }
  return names;
}

describe('MCP tool registry is a maintained, isolation-gated inventory (KAN-77)', () => {
  it('every server.registerTool(...) call in mcp-tools.ts/mcp-act-tools.ts is listed in EXPECTED_TOOLS', () => {
    const found = TOOL_FILES.flatMap((file) => findRegisteredToolNames(readToolFile(file)));
    expect(found.length).toBeGreaterThan(0);

    const unlisted = found.filter((name) => !(name in EXPECTED_TOOLS));
    if (unlisted.length > 0) {
      throw new Error(
        `New MCP tool(s) not registered in EXPECTED_TOOLS: ${unlisted.join(', ')}. Add an entry with its gate here, and an isolation scenario in mcp.controller.e2e.spec.ts.`,
      );
    }

    const stale = Object.keys(EXPECTED_TOOLS).filter((name) => !found.includes(name));
    if (stale.length > 0) {
      throw new Error(`Stale EXPECTED_TOOLS entr(y/ies) for tool(s) no longer registered: ${stale.join(', ')}`);
    }
  });

  it('every act tool requires a specific permission beyond the shared connection-level mcp.read gate', () => {
    const actToolGates = Object.values(EXPECTED_TOOLS).filter((gate) => gate.kind === 'per-call-permission');
    expect(actToolGates.length).toBeGreaterThan(0);
    for (const gate of actToolGates) {
      expect(gate.permission).not.toBe('mcp.read');
    }
  });

  /**
   * A dual-gated tool still has to put a real permission in front of the half
   * that writes — the read-level path exists for previews only, and must never
   * become the gate on the mutating branch (KAN-175).
   */
  it('a tool whose permission varies still gates its writing path above mcp.read', () => {
    const varying = Object.values(EXPECTED_TOOLS).filter((gate) => gate.kind === 'per-call-permission-varies');
    expect(varying.length).toBeGreaterThan(0);
    for (const gate of varying) {
      expect(gate.writePermission).not.toBe('mcp.read');
      expect(gate.readOnlyPermission).toBe('mcp.read');
      expect(gate.readOnlyWhen.length).toBeGreaterThan(0);
    }
  });

  it('every tool call is wrapped in auditedToolHandler (KAN-77: "all calls audited")', () => {
    for (const file of TOOL_FILES) {
      const source = readToolFile(file);
      const registrations = source.split('server.registerTool(').slice(1);
      const unaudited = registrations.filter((chunk) => !chunk.includes('auditedToolHandler'));
      if (unaudited.length > 0) {
        throw new Error(`${file} has a server.registerTool(...) call whose handler isn't wrapped in auditedToolHandler`);
      }
    }
  });
});
