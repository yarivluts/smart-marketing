/* eslint-disable @typescript-eslint/no-explicit-any -- same TypeScript-compiler-limit reason `mcp-tools.ts`'s own top-of-file comment documents: every tool callback's `args` param is `any`, narrowed/validated by hand inside each handler. */
import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import {
  archiveMetricDefinition,
  archiveProject,
  CORE_TABLE_CATALOG,
  BIGQUERY_DISABLED_CORE_TABLES,
  createHookEndpoint,
  DuplicateMetricDefinitionError,
  evolveMetricDefinition,
  GoalNotFoundError,
  HookEndpointNotFoundError,
  HookEndpointNotHmacModeError,
  InvalidMetricDefinitionError,
  InvalidProjectCurrencyError,
  InvalidProjectNameError,
  InvalidProjectTimezoneError,
  deleteGoal,
  getGoal,
  isGoalStatus,
  listEnvironmentsForProject,
  listGoalsForProject,
  listHookEndpointsForProject,
  listMetricDefinitionVersions,
  listOrgProjects,
  listSchemaDefinitionsForProject,
  MetricDefNotFoundError,
  MetricDefStillReferencedError,
  MissingSignatureHeaderNameError,
  ProjectNotFoundError,
  purgeProjectLandedData,
  PURGEABLE_LANDED_DATA_COLLECTIONS,
  queryGoalProgress,
  reexportRawRecordsToWarehouse,
  registerMetricDefinition,
  setGoalStatus,
  setHookEndpointSigningSecret,
  unarchiveProject,
  updateProjectDetails,
  VaultNotConfiguredError,
  WarehouseNotConfiguredError,
  type MetricDefinitionInput,
} from '@growthos/firebase-orm-models';
import type { Permission } from '@growthos/shared';
import { getServerKmsProvider } from '../vault/kms-provider';
import { auditedToolHandler, errorResult, textResult, toolInputSchema, type ToolResult } from './mcp-tools';
import { mcpCallerHasPermission } from './mcp-act-authorization';
import type { McpAuthContext } from './mcp-auth.guard';

/**
 * The self-service administration surface: every operation a GrowthOS
 * engineer previously had to run by hand on a customer's behalf, exposed as
 * an MCP tool so the customer's own agent can run it instead.
 *
 * Scope came directly from the EasySign audit (2026-09-08). Closing it took
 * a human running, one at a time: archiving five dead metric definitions,
 * evolving two more onto the right table/dimensions, pausing a goal that was
 * measuring seed data, archiving a duplicate project, declaring the
 * project's currency and timezone, purging synthetic records so real data
 * could land clean, backfilling records that predated the warehouse export,
 * and provisioning a signed webhook receiver. Not one of those had an MCP
 * tool, and several had no API at all. Every one of them is a tool here.
 *
 * Same three rules as `mcp-act-tools.ts`, for the same reasons: each tool
 * calls the exact `packages/firebase-orm-models` service function the
 * equivalent `apps/web` route already calls (no parallel mutation path, and
 * audit logging comes for free inside those services); each re-checks its
 * own specific permission on every call via `mcpCallerHasPermission`; and
 * every mutation is scoped to `auth.organizationId`/`auth.projectId`, never
 * to an id the caller supplies, so no tool here can reach another tenant.
 *
 * On permissions: the audit's P-08 found that every documented onboarding
 * step ended in a tool requiring `project.manage` — a permission
 * `API_KEY_SCOPES` deliberately withholds from machine principals, making
 * the documented path impossible to complete with an issued key. The fix was
 * not to grant `project.manage` to keys but to split it: `project.configure`
 * (new) covers a project describing ITSELF — name, vertical, currency,
 * timezone, archived-or-not — while `project.manage` keeps covering who has
 * access. See `permissions.ts`.
 */

function describeAdminToolError(error: unknown): string {
  if (error instanceof ProjectNotFoundError || error instanceof GoalNotFoundError || error instanceof HookEndpointNotFoundError || error instanceof MetricDefNotFoundError) {
    return error instanceof MetricDefNotFoundError ? error.message : 'Not found.';
  }
  if (error instanceof InvalidMetricDefinitionError) {
    return `Invalid metric definition: ${error.reasons.join('; ')}`;
  }
  if (error instanceof MetricDefStillReferencedError) {
    return error.message;
  }
  if (
    error instanceof DuplicateMetricDefinitionError ||
    error instanceof InvalidProjectNameError ||
    error instanceof InvalidProjectCurrencyError ||
    error instanceof InvalidProjectTimezoneError ||
    error instanceof MissingSignatureHeaderNameError ||
    error instanceof HookEndpointNotHmacModeError ||
    error instanceof WarehouseNotConfiguredError ||
    error instanceof VaultNotConfiguredError
  ) {
    return error.message;
  }
  throw error;
}

function insufficientPermissionMessage(auth: McpAuthContext, permission: string): string {
  if (auth.principalKind === 'api_key') {
    return `This API key does not carry the "${permission}" scope required for this tool.`;
  }
  return `This MCP connection's user does not currently hold "${permission}" for this project.`;
}

function actorId(auth: McpAuthContext): string {
  return auth.userId ?? auth.apiKeyId ?? 'unknown-mcp-caller';
}

/** Shared body for every admin tool — identical shape to `mcp-act-tools.ts`'s `runActTool`, with this module's own error vocabulary. */
async function runAdminTool<Args>(auth: McpAuthContext, permission: Permission, args: unknown, handler: (args: Args) => Promise<ToolResult>): Promise<ToolResult> {
  if (!(await mcpCallerHasPermission(auth, permission))) {
    return errorResult(insufficientPermissionMessage(auth, permission));
  }
  try {
    return await handler(args as Args);
  } catch (error) {
    return errorResult(describeAdminToolError(error));
  }
}

/**
 * Builds a `MetricDefinitionInput` from the flat tool arguments. Flat rather
 * than a nested object because an MCP client composes these by hand: one
 * level of `{ function, table, column, time_column, filters }` is far easier
 * to get right than the nested discriminated union the service takes.
 */
function toMetricDefinition(args: {
  kind: string;
  formula?: string;
  function?: string;
  table?: string;
  column?: string;
  time_column?: string;
  filters?: unknown;
}): MetricDefinitionInput {
  if (args.kind === 'formula') {
    return { kind: 'formula', formula: String(args.formula ?? '') };
  }
  const filters = Array.isArray(args.filters)
    ? args.filters.map((filter) => {
        const entry = filter as { field?: unknown; op?: unknown; operator?: unknown; value?: unknown };
        return { field: String(entry.field ?? ''), operator: String(entry.operator ?? entry.op ?? '=') as never, value: String(entry.value ?? '') };
      })
    : [];
  return {
    kind: 'aggregation',
    aggregation: {
      function: String(args.function ?? '') as never,
      table: String(args.table ?? ''),
      ...(args.column !== undefined ? { column: String(args.column) } : {}),
      timeColumn: String(args.time_column ?? ''),
      filters,
    },
  };
}

const metricDefinitionInputShape = {
  name: z.string().min(1).describe('Metric name: lowercase letters, digits and underscores, starting with a letter.'),
  kind: z.string().describe('One of: aggregation, formula.'),
  function: z.string().optional().describe('Aggregation only. One of: sum, count, count_distinct, avg, min, max.'),
  table: z.string().optional().describe('Aggregation only. A dbt core table (see list_warehouse_tables) or one of this project\'s registered measure/entity schemas (see list_schemas).'),
  column: z.string().optional().describe('Aggregation only. Required for every function except count. Must exist on the table.'),
  time_column: z.string().optional().describe('Aggregation only. The timestamp/date column to bucket by. Must exist on the table.'),
  filters: z.unknown().optional().describe('Aggregation only. Array of { field, op, value }; every field must exist on the table.'),
  formula: z.string().optional().describe('Formula only, e.g. "ad_spend / signups". Every referenced metric must already be registered and active.'),
  dimensions: z.unknown().optional().describe('Breakdown dimensions. For an aggregation each must be a real column on the table; for a formula each must be declared on EVERY referenced metric.'),
};

const archiveMetricInputShape = { name: z.string().min(1).describe('The metric family to retire. Refused while an active formula still references it.') };
const metricVersionsInputShape = { name: z.string().min(1) };
const goalIdInputShape = { goal_id: z.string().min(1) };
const goalStatusInputShape = {
  goal_id: z.string().min(1),
  status: z.string().describe('One of: active, paused. A paused goal stops being tracked without being deleted.'),
};
const projectSettingsInputShape = {
  name: z.string().optional().describe('Leave unset to keep the current name.'),
  vertical: z.string().optional().describe('Empty string clears it.'),
  currency: z.string().optional().describe('ISO-4217 code, e.g. ILS or USD. Empty string clears it.'),
  timezone: z.string().optional().describe('IANA time zone, e.g. Asia/Jerusalem. Empty string clears it.'),
};
const archiveProjectInputShape = { archived: z.boolean().describe('true archives this project (hiding it from every listing without deleting anything); false restores it.') };
const createHookInputShape = {
  name: z.string().min(1),
  environment_id: z.string().optional().describe('Defaults to the environment this connection is bound to, or the project\'s prod environment for an OAuth connection.'),
  signature_mode: z.string().optional().describe('One of: none, hmac_sha256. Defaults to hmac_sha256 — prefer it, and set a secret straight after.'),
  signature_header_name: z.string().optional().describe('Required for hmac_sha256, e.g. X-GrowthOS-Signature or X-Hub-Signature-256. The sender must put hex HMAC-SHA256(secret, raw_body) there, optionally prefixed "sha256=".'),
};
const setHookSecretInputShape = {
  hook_endpoint_id: z.string().min(1),
  signing_secret: z.string().min(16).describe('The shared secret the sender signs with. Rotating keeps the previous secret valid for a short grace window.'),
};
const reexportInputShape = {
  schema_name: z.string().optional().describe('Restrict the backfill to one schema; omit for every schema, newest-landed first.'),
  limit: z.number().int().positive().optional(),
};
const purgeInputShape = {
  confirm_project_id: z.string().min(1).describe('Must exactly equal this connection\'s own project id. A deliberate guard: this deletes landed data irreversibly.'),
  environment_id: z.string().optional().describe('Restrict the purge to one environment; omit to clear every environment.'),
};

export function registerMcpAdminTools(server: McpServer, auth: McpAuthContext): void {
  server.registerTool(
    'list_warehouse_tables',
    {
      title: 'List warehouse tables',
      description:
        'List every dbt-built core table and its real columns with types. Read this BEFORE registering or evolving an aggregation metric: registration rejects a table, column, time column, filter field or dimension that does not exist, and this is the catalog it checks against.',
      inputSchema: {},
    },
    auditedToolHandler(auth, 'list_warehouse_tables', async () =>
      textResult({
        tables: [
          ...Object.entries(CORE_TABLE_CATALOG).map(([table, columns]) => ({
            table,
            built: true,
            columns: Object.entries(columns).map(([column, type]) => ({ column, type })),
          })),
          // Declared by dbt but deliberately not materialized — listed so a caller sees the
          // honest "exists, cannot be queried yet" rather than "no such table".
          ...[...BIGQUERY_DISABLED_CORE_TABLES].map((table) => ({ table, built: false, columns: [] as Array<{ column: string; type: string }> })),
        ].sort((a, b) => a.table.localeCompare(b.table)),
        not_built_note: 'A table with built: false is declared by dbt but deliberately not materialized in the warehouse yet; registering a metric against it is refused.',
      }),
    ),
  );

  server.registerTool(
    'list_schemas',
    {
      title: 'List registered schemas',
      description: "List this project's registered event/entity/measure schemas and their declared fields. A measure or entity schema is queryable as a metric table by its own name; its columns are its fields plus the intrinsic ones.",
      inputSchema: {},
    },
    auditedToolHandler(auth, 'list_schemas', async () => {
      const schemas = await listSchemaDefinitionsForProject(auth.organizationId, auth.projectId);
      return textResult({
        schemas: schemas
          .filter((schema) => schema.status === 'active')
          .map((schema) => ({
            name: schema.name,
            kind: schema.kind,
            version: schema.version,
            fields: schema.field_defs.map((field) => ({ name: field.name, type: field.type, required: field.is_required })),
          })),
      });
    }),
  );

  server.registerTool(
    'list_metric_versions',
    {
      title: 'List metric versions',
      description: 'The full version history of one metric family, oldest first, including superseded and archived versions.',
      inputSchema: toolInputSchema(metricVersionsInputShape),
    },
    auditedToolHandler(auth, 'list_metric_versions', async (args: any) => {
      const versions = await listMetricDefinitionVersions(auth.organizationId, auth.projectId, String((args as { name: unknown }).name));
      return textResult({
        versions: versions.map((version) => ({
          version: version.version,
          status: version.status,
          definition_kind: version.definition_kind,
          aggregation: version.aggregation ?? null,
          formula: version.formula ?? null,
          dimensions: version.dimensions,
          created_at: version.created_at,
        })),
      });
    }),
  );

  server.registerTool(
    'register_metric',
    {
      title: 'Register metric',
      description:
        'Register a brand-new metric (v1). Validated against the real warehouse schema: the table must exist, every column/time column/filter field/dimension must exist on it, sum/avg need a numeric column, and a formula may only declare dimensions every referenced metric shares. Requires "metrics.write".',
      inputSchema: toolInputSchema(metricDefinitionInputShape),
    },
    auditedToolHandler(auth, 'register_metric', async (args: any) =>
      runAdminTool(auth, 'metrics.write', args, async (a: any) => {
        const metricDef = await registerMetricDefinition({
          organizationId: auth.organizationId,
          projectId: auth.projectId,
          name: String(a.name),
          definition: toMetricDefinition(a),
          dimensions: Array.isArray(a.dimensions) ? a.dimensions.map(String) : [],
          createdByUserId: actorId(auth),
        });
        return textResult({ name: metricDef.name, version: metricDef.version, status: metricDef.status });
      }),
    ),
  );

  server.registerTool(
    'evolve_metric',
    {
      title: 'Evolve metric',
      description:
        'Register the next version of an already-registered metric, replacing its definition and dimensions. The previous version is kept as "superseded" so historical dashboards can still pin it. Same validation as register_metric. Requires "metrics.write".',
      inputSchema: toolInputSchema(metricDefinitionInputShape),
    },
    auditedToolHandler(auth, 'evolve_metric', async (args: any) =>
      runAdminTool(auth, 'metrics.write', args, async (a: any) => {
        const metricDef = await evolveMetricDefinition({
          organizationId: auth.organizationId,
          projectId: auth.projectId,
          name: String(a.name),
          definition: toMetricDefinition(a),
          dimensions: Array.isArray(a.dimensions) ? a.dimensions.map(String) : [],
          createdByUserId: actorId(auth),
        });
        return textResult({ name: metricDef.name, version: metricDef.version, status: metricDef.status });
      }),
    ),
  );

  server.registerTool(
    'archive_metric',
    {
      title: 'Archive metric',
      description:
        'Retire a metric family: it disappears from list_metrics and stops resolving for queries, goals and formulas, while every version stays on record. Refused while an active formula metric still references it. Requires "metrics.write".',
      inputSchema: toolInputSchema(archiveMetricInputShape),
    },
    auditedToolHandler(auth, 'archive_metric', async (args: any) =>
      runAdminTool(auth, 'metrics.write', args, async (a: { name: string }) => {
        const metricDef = await archiveMetricDefinition({
          organizationId: auth.organizationId,
          projectId: auth.projectId,
          name: a.name,
          archivedByUserId: actorId(auth),
        });
        return textResult({ name: metricDef.name, version: metricDef.version, status: metricDef.status });
      }),
    ),
  );

  server.registerTool(
    'list_goals',
    {
      title: 'List goals',
      description:
        "Every goal in this project, soonest deadline first, with its metric, target (or range), owner and whether it is currently paused. The read side of create_goal and set_goal_status — a goal id from here is what those tools take.",
      inputSchema: {},
    },
    auditedToolHandler(auth, 'list_goals', async () => {
      const goals = await listGoalsForProject(auth.organizationId, auth.projectId);
      return textResult({
        goals: goals.map((goal) => ({
          id: goal.id,
          name: goal.name,
          metric_name: goal.metric_name,
          direction: goal.direction,
          target_value: goal.target_value,
          range_min: goal.range_min,
          range_max: goal.range_max,
          start_date: goal.start_date,
          deadline: goal.deadline,
          rhythm: goal.rhythm,
          owner_person_id: goal.owner_person_id,
          status: goal.status ?? 'active',
        })),
      });
    }),
  );

  server.registerTool(
    'get_goal_progress',
    {
      title: 'Get goal progress',
      description:
        "One goal's live progress: the metric's actual value so far, where it should be by now at the goal's own calendar rhythm, the projected final value, and an on_track/at_risk/off_track pace. Returns a typed reason instead of a number when the warehouse cannot answer.",
      inputSchema: toolInputSchema(goalIdInputShape),
    },
    auditedToolHandler(auth, 'get_goal_progress', async (args: any) => {
      const goal = await getGoal(auth.organizationId, auth.projectId, String((args as { goal_id: unknown }).goal_id));
      if (!goal) {
        return errorResult('No such goal in this project.');
      }
      const outcome = await queryGoalProgress({ organizationId: auth.organizationId, projectId: auth.projectId, goal });
      if (!outcome.ok) {
        return textResult({ id: goal.id, name: goal.name, available: false, reason: outcome.reason, detail: outcome.message });
      }
      return textResult({
        id: goal.id,
        name: goal.name,
        available: true,
        actual_value: outcome.actualValue,
        expected_at_now: outcome.progress.expectedAtNow,
        projected_final_value: outcome.progress.projectedFinalValue,
        progress_ratio: outcome.progress.progressRatio,
        status: outcome.progress.status,
        status_note: 'A paused goal is still reported here; pace is only meaningful for an active one.',
      });
    }),
  );

  server.registerTool(
    'delete_goal',
    {
      title: 'Delete goal',
      description: 'Delete a goal outright. Prefer set_goal_status with "paused" when the goal may matter again — a delete cannot be undone. Requires "dashboards.write".',
      inputSchema: toolInputSchema(goalIdInputShape),
    },
    auditedToolHandler(auth, 'delete_goal', async (args: any) =>
      runAdminTool(auth, 'dashboards.write', args, async (a: { goal_id: string }) => {
        await deleteGoal(auth.organizationId, auth.projectId, a.goal_id, actorId(auth));
        return textResult({ id: a.goal_id, deleted: true });
      }),
    ),
  );

  server.registerTool(
    'set_goal_status',
    {
      title: 'Pause or resume a goal',
      description: 'Pause a goal (it stops being tracked, without being deleted) or resume a paused one. Requires "dashboards.write".',
      inputSchema: toolInputSchema(goalStatusInputShape),
    },
    auditedToolHandler(auth, 'set_goal_status', async (args: any) =>
      runAdminTool(auth, 'dashboards.write', args, async (a: { goal_id: string; status: string }) => {
        if (!isGoalStatus(a.status)) {
          return errorResult('status must be one of: active, paused.');
        }
        const goal = await setGoalStatus(auth.organizationId, auth.projectId, a.goal_id, a.status, actorId(auth));
        return textResult({ id: goal.id, name: goal.name, status: goal.status ?? 'active' });
      }),
    ),
  );

  server.registerTool(
    'update_project_settings',
    {
      title: 'Update project settings',
      description:
        "Update this project's own description: name, vertical, currency (ISO-4217) and time zone (IANA). Declaring a currency and time zone is what stops money being reported as USD-implicit and day buckets as UTC-implicit. Requires \"project.configure\".",
      inputSchema: toolInputSchema(projectSettingsInputShape),
    },
    auditedToolHandler(auth, 'update_project_settings', async (args: any) =>
      runAdminTool(auth, 'project.configure', args, async (a: { name?: string; vertical?: string; currency?: string; timezone?: string }) => {
        // `updateProjectDetails` always writes `name`, so a caller changing only the currency
        // must not blank it — read the current one and pass it back unchanged.
        const projects = await listOrgProjects(auth.organizationId, { includeArchived: true });
        const current = projects.find((candidate) => candidate.id === auth.projectId);
        if (!current) {
          throw new ProjectNotFoundError();
        }
        const project = await updateProjectDetails({
          organizationId: auth.organizationId,
          projectId: auth.projectId,
          name: a.name ?? current.name,
          vertical: a.vertical ?? current.vertical ?? '',
          ...(a.currency !== undefined ? { currency: a.currency } : {}),
          ...(a.timezone !== undefined ? { timezone: a.timezone } : {}),
          actorUserId: actorId(auth),
        });
        return textResult({
          id: project.id,
          name: project.name,
          vertical: project.vertical ?? '',
          currency: project.currency ?? '',
          timezone: project.timezone ?? '',
        });
      }),
    ),
  );

  server.registerTool(
    'archive_project',
    {
      title: 'Archive or restore this project',
      description:
        'Archive this project — it disappears from every project listing and switcher without a single document under it being deleted — or restore an archived one. Requires "project.configure".',
      inputSchema: toolInputSchema(archiveProjectInputShape),
    },
    auditedToolHandler(auth, 'archive_project', async (args: any) =>
      runAdminTool(auth, 'project.configure', args, async (a: { archived: boolean }) => {
        const project = a.archived
          ? await archiveProject(auth.organizationId, auth.projectId, actorId(auth))
          : await unarchiveProject(auth.organizationId, auth.projectId, actorId(auth));
        return textResult({ id: project.id, name: project.name, archived_at: project.archived_at ?? null });
      }),
    ),
  );

  server.registerTool(
    'list_hook_endpoints',
    {
      title: 'List webhook endpoints',
      description: "Every inbound webhook receiver this project has, with the full URL to point a sender at and whether a signing secret has been set. Never returns the secret itself.",
      inputSchema: {},
    },
    auditedToolHandler(auth, 'list_hook_endpoints', async () => {
      const endpoints = await listHookEndpointsForProject(auth.organizationId, auth.projectId);
      return textResult({
        hook_endpoints: endpoints.map((endpoint) => ({
          id: endpoint.id,
          name: endpoint.name,
          environment_id: endpoint.environment_id,
          url_path: `/v1/hooks/${endpoint.hook_id}`,
          signature_mode: endpoint.signature_mode,
          signature_header_name: endpoint.signature_header_name ?? null,
          signing_secret_set: endpoint.signing_secret_encrypted !== undefined,
          disabled_at: endpoint.disabled_at ?? null,
        })),
        signature_note: 'For hmac_sha256, sign the exact raw request body: hex HMAC-SHA256(secret, raw_body), optionally prefixed "sha256=", in the endpoint\'s own signature header.',
      });
    }),
  );

  server.registerTool(
    'create_hook_endpoint',
    {
      title: 'Create a webhook endpoint',
      description:
        'Provision an inbound webhook receiver for this project and return the URL path to give the sender. Create it with hmac_sha256 and then call set_hook_signing_secret — until a secret is set, every signed delivery is rejected. Requires "ingest.write".',
      inputSchema: toolInputSchema(createHookInputShape),
    },
    auditedToolHandler(auth, 'create_hook_endpoint', async (args: any) =>
      runAdminTool(auth, 'ingest.write', args, async (a: { name: string; environment_id?: string; signature_mode?: string; signature_header_name?: string }) => {
        // An API-key connection is already bound to one environment; an OAuth connection is not,
        // so it falls back to the project's prod slice — the same default `queryMetrics` applies.
        let environmentId = a.environment_id ?? auth.environmentId;
        if (environmentId === undefined) {
          const environments = await listEnvironmentsForProject(auth.organizationId, auth.projectId);
          environmentId = (environments.find((environment) => environment.name === 'prod') ?? environments[0])?.id;
        }
        if (environmentId === undefined) {
          return errorResult('This project has no environments to attach a hook endpoint to.');
        }
        const signatureMode = a.signature_mode === 'none' ? 'none' : 'hmac_sha256';
        const endpoint = await createHookEndpoint({
          organizationId: auth.organizationId,
          projectId: auth.projectId,
          environmentId,
          name: a.name,
          signatureMode,
          ...(a.signature_header_name !== undefined ? { signatureHeaderName: a.signature_header_name } : signatureMode === 'hmac_sha256' ? { signatureHeaderName: 'X-GrowthOS-Signature' } : {}),
          createdByUserId: actorId(auth),
        });
        return textResult({
          id: endpoint.id,
          url_path: `/v1/hooks/${endpoint.hook_id}`,
          environment_id: endpoint.environment_id,
          signature_mode: endpoint.signature_mode,
          signature_header_name: endpoint.signature_header_name ?? null,
          next_step: signatureMode === 'hmac_sha256' ? 'Call set_hook_signing_secret with this id before pointing a sender at it.' : null,
        });
      }),
    ),
  );

  server.registerTool(
    'set_hook_signing_secret',
    {
      title: 'Set a webhook signing secret',
      description:
        'Set (or rotate) the HMAC signing secret of an hmac_sha256 webhook endpoint. The secret is envelope-encrypted and never readable back through any tool. Rotating keeps the previous secret valid for a short grace window so the sender can catch up. Requires "ingest.write".',
      inputSchema: toolInputSchema(setHookSecretInputShape),
    },
    auditedToolHandler(auth, 'set_hook_signing_secret', async (args: any) =>
      runAdminTool(auth, 'ingest.write', args, async (a: { hook_endpoint_id: string; signing_secret: string }) => {
        const endpoint = await setHookEndpointSigningSecret({
          organizationId: auth.organizationId,
          projectId: auth.projectId,
          hookEndpointId: a.hook_endpoint_id,
          signingSecret: a.signing_secret,
          kms: getServerKmsProvider(),
          actedByUserId: actorId(auth),
        });
        return textResult({ id: endpoint.id, url_path: `/v1/hooks/${endpoint.hook_id}`, signing_secret_set: true });
      }),
    ),
  );

  server.registerTool(
    'reexport_raw_records',
    {
      title: 'Re-export landed records to the warehouse',
      description:
        'Backfill already-landed records into the warehouse for records accepted before this environment had a warehouse export configured. Idempotent by record: re-exporting one that already arrived is deduplicated in the staging layer. Requires "ingest.write".',
      inputSchema: toolInputSchema(reexportInputShape),
    },
    auditedToolHandler(auth, 'reexport_raw_records', async (args: any) =>
      runAdminTool(auth, 'ingest.write', args, async (a: { schema_name?: string; limit?: number }) => {
        const result = await reexportRawRecordsToWarehouse({
          organizationId: auth.organizationId,
          projectId: auth.projectId,
          ...(a.schema_name !== undefined ? { schemaName: a.schema_name } : {}),
          ...(a.limit !== undefined ? { limit: a.limit } : {}),
          performedByUserId: actorId(auth),
        });
        return textResult(result);
      }),
    ),
  );

  server.registerTool(
    'purge_project_data',
    {
      title: 'Purge landed data',
      description:
        'Irreversibly delete every landed record and its bookkeeping for this project — raw records, pipeline messages, ingest batches, quarantined records, dedup keys, win events and tracking alerts — so real data can start clean. Configuration is untouched: metrics, goals, segments, win rules, schemas, keys, hook endpoints, boards and automation targets all survive. The warehouse copy needs a separate raw-table delete plus a dbt rebuild. Requires "ingest.write" and an explicit confirm_project_id.',
      inputSchema: toolInputSchema(purgeInputShape),
    },
    auditedToolHandler(auth, 'purge_project_data', async (args: any) =>
      runAdminTool(auth, 'ingest.write', args, async (a: { confirm_project_id: string; environment_id?: string }) => {
        if (a.confirm_project_id !== auth.projectId) {
          return errorResult(`confirm_project_id must equal this connection's own project id ("${auth.projectId}") — nothing was deleted.`);
        }
        const deleted = await purgeProjectLandedData({
          organizationId: auth.organizationId,
          projectId: auth.projectId,
          ...(a.environment_id !== undefined ? { environmentId: a.environment_id } : {}),
          performedByUserId: actorId(auth),
        });
        return textResult({
          deleted,
          collections_cleared: PURGEABLE_LANDED_DATA_COLLECTIONS,
          warehouse_note: 'The warehouse still holds the exported copies until those rows are deleted from the raw table and dbt rebuilds.',
        });
      }),
    ),
  );
}
