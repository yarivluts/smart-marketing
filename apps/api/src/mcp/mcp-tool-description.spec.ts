import { registerMcpTools } from './mcp-tools';
import { registerMcpActTools } from './mcp-act-tools';
import { registerMcpAdminTools } from './mcp-admin-tools';
import { registerMcpSetupTools } from './mcp-setup-tools';
import type { McpAuthContext } from './mcp-auth.guard';

/**
 * A tool's description IS its API documentation. For an MCP caller it is the
 * only documentation — an agent picks and fills a tool from the text alone, and
 * cannot read this repo to discover a parameter the description forgot to
 * mention.
 *
 * Nothing tested that text, and this cycle produced five defects that all live
 * there rather than in behaviour: `register_schema` stated a rule the code did
 * not enforce (KAN-120); "envelope" meant opposite things in two layers
 * (KAN-124); comments claimed the BigQuery executor and prod dbt target were
 * inert when both were live (KAN-125); `purge_project_data`'s description
 * omitted `environment_id`, so an integrator with dev-only debris concluded a
 * dev-scoped purge did not exist; and KAN-82's closing comment listed tools that
 * were never built.
 *
 * Direction decides who pays. An OVERSTATED capability makes an integrator build
 * against nothing. An UNDERSTATED one makes them not use what exists — cheap only
 * when someone happens to say out loud why they are not asking. An understated
 * *rule* is the expensive case, because it causes silent data loss.
 *
 * ## What this asserts, and what was rejected
 *
 * The proposal that prompted this was: assert every parameter name appears in
 * its tool's description text. Measured against the real surface, that fails 57
 * parameters across 34 tools — it would force every description to recite its
 * own parameter list, which is redundant with the per-parameter `.describe()`
 * the MCP schema already carries and would make the prose worse, not better. A
 * rule that can only be satisfied by padding is not a rule worth having.
 *
 * What holds instead: every parameter must carry its own `.describe()`. That is
 * the same defect class at the level where it actually bites — a caller sees a
 * parameter's name and type and nothing else, and cannot read this repo to learn
 * what it means. It found 14 genuinely undocumented parameters.
 *
 * Neither version can tell whether a description's claims about behaviour are
 * TRUE; both close only the discoverability half. Saying so matters: a green run
 * here means every parameter is documented, not that the prose is honest.
 *
 * Suggested by the EasySign integration, which paid for three of the five.
 */

interface RecordedTool {
  name: string;
  description: string;
  params: string[];
  raw: Record<string, unknown>;
}

function recordRegisteredTools(): RecordedTool[] {
  const recorded: RecordedTool[] = [];
  const server = {
    registerTool(name: string, config: { description?: string; inputSchema?: Record<string, unknown> }) {
      recorded.push({
        name,
        description: config.description ?? '',
        params: Object.keys(config.inputSchema ?? {}),
        raw: (config.inputSchema ?? {}) as Record<string, unknown>,
      });
    },
  };

  const auth: McpAuthContext = {
    organizationId: 'org-under-test',
    projectId: 'project-under-test',
    principalKind: 'api_key',
    scopes: [],
  } as McpAuthContext;

  // Registration only records shape — no handler runs, so this needs no
  // Firestore, no warehouse and no network.
  registerMcpTools(server as never, auth);
  registerMcpActTools(server as never, auth);
  registerMcpAdminTools(server as never, auth);
  registerMcpSetupTools(server as never, auth);
  return recorded;
}

describe('every MCP tool parameter documents itself', () => {
  const tools = recordRegisteredTools();

  it('registers a non-trivial number of tools, so a silent registration failure cannot make this vacuous', () => {
    // Without this, a refactor that stops registering anything turns every
    // assertion below into a pass over an empty list.
    expect(tools.length).toBeGreaterThan(20);
  });

  it('gives every tool a description', () => {
    const undescribed = tools.filter((tool) => tool.description.trim().length === 0).map((tool) => tool.name);
    expect(undescribed).toEqual([]);
  });

  it('gives every parameter its own describe()', () => {
    const undocumented: string[] = [];
    for (const tool of tools) {
      for (const [param, schema] of Object.entries(tool.raw)) {
        const own = (schema as { _def?: { description?: string } })?._def?.description ?? '';
        if (own.trim().length === 0) undocumented.push(`${tool.name}.${param}`);
      }
    }
    // Labelled rather than a bare array so the failure says what to do: add a
    // .describe() to the parameter. A caller sees the name and type and nothing
    // else, and cannot read this repo to find out what the parameter means.
    expect({ parametersWithNoDescription: undocumented }).toEqual({ parametersWithNoDescription: [] });
  });
});
