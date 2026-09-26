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
  evolveSchemaDefinition,
  GoalNotFoundError,
  HookEndpointNotFoundError,
  HookEndpointNotHmacModeError,
  InvalidFunnelDefinitionError,
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
  IMPLICIT_EVENT_ENVELOPE_FIELDS,
  MetricDefNotFoundError,
  MetricDefStillReferencedError,
  MissingSignatureHeaderNameError,
  ProjectNotFoundError,
  purgeProjectLandedData,
  PURGEABLE_LANDED_DATA_COLLECTIONS,
  queryGoalProgress,
  resolveMetricDisplayUnits,
  reexportRawRecordsToWarehouse,
  registerMetricDefinition,
  describeSchemaDefinitionWarnings,
  previewProjectFunnel,
  previewSchemaDefinition,
  registerSchemaDefinition,
  setGoalStatus,
  setHookEndpointSigningSecret,
  setProjectFunnel,
  unarchiveProject,
  updateProjectDetails,
  VaultNotConfiguredError,
  WarehouseNotConfiguredError,
  type FunnelStepInput,
  type MetricDefinitionInput,
  type OnboardingFunnelStep,
} from '@growthos/firebase-orm-models';
import { FUNNEL_STAGE_KEYS, formatMetricValue, serializeMetricUnit, type ParsedMetricUnit, type Permission } from '@growthos/shared';
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
  if (error instanceof InvalidFunnelDefinitionError) {
    const accepted =
      error.availableEventSchemas.length > 0
        ? `Registered event schemas you can use: ${error.availableEventSchemas.join(', ')}.`
        : 'This project has no registered event schemas yet - register them with register_schema first.';
    return `Invalid funnel: ${error.reasons.join(' ')} ${accepted} Nothing was saved.`;
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
/**
 * Which permission a `register_schema` call needs — `mcp.read` for a dry run,
 * `schema.write` to actually create the schema (KAN-175).
 *
 * A dry run writes nothing, and gating it at write level made the safety net
 * exactly as hard to reach as the thing it protects against: anyone who could
 * preview could already commit, and anyone who could not commit could not even
 * look. The person checking whether their schema file is correct — in order to
 * decide whether to ask for write access — was precisely who the preview was
 * built for, and precisely who could not run it. It also made a scope problem
 * present as a validation problem, since the refusal arrives where a schema
 * error would.
 *
 * The information-disclosure objection does not survive contact with
 * `list_schemas`, which needs only `mcp.read` and already returns every active
 * schema's name, kind, version and fields. A dry run's "would this name
 * conflict" is strictly less than that, over the same namespace.
 *
 * Reads the RAW args, not the parsed ones: the permission check runs before the
 * handler, so anything other than a literal `true` here must fall through to
 * `schema.write` rather than be coerced into a dry run.
 */
export function requiredRegisterSchemaPermission(args: unknown): Permission {
  return requiredDryRunablePermission(args, 'schema.write');
}

/**
 * Which permission a `set_funnel` call needs (KAN-199) — `mcp.read` for a dry
 * run, `project.configure` to actually replace the confirmed funnel.
 *
 * `project.configure` rather than the `project.manage` the web wizard's route
 * checks: which events make up this project's funnel is the project describing
 * ITSELF, the exact category `project.configure` was split out of
 * `project.manage` for (see `permissions.ts`) — and `project.manage` is
 * withheld from API keys, so choosing it would recreate the P-08 dead end this
 * tool exists to remove. It is not `schema.write` (no schema changes) nor
 * `dashboards.write` (a funnel is not a board, and dashboards.write would let
 * a board-editing key redefine what every funnel view measures). The dry-run
 * split follows `requiredRegisterSchemaPermission`'s reasoning unchanged: a
 * preview writes nothing and discloses no more than `list_schemas` already
 * does.
 */
export function requiredSetFunnelPermission(args: unknown): Permission {
  return requiredDryRunablePermission(args, 'project.configure');
}

/**
 * Shared by every tool with a `dry_run` flag. Reads the RAW args: the
 * permission check runs before the handler, so only a literal `true` counts
 * as a dry run — anything else falls through to the write permission rather
 * than being coerced into the cheaper one.
 */
function requiredDryRunablePermission(args: unknown, writePermission: Permission): Permission {
  return (args as { dry_run?: unknown } | null | undefined)?.dry_run === true ? 'mcp.read' : writePermission;
}

/** A value formatted in its metric's unit for an MCP response (KAN-213), or `null` when there is no value. English, since a tool response is read by an agent rather than shown to a viewer. */
function formattedOrNull(value: number | null | undefined, unit: ParsedMetricUnit): string | null {
  return value === null || value === undefined || !Number.isFinite(value) ? null : formatMetricValue(value, unit, 'en');
}

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
  unit: z
    .string()
    .nullable()
    .optional()
    .describe(
      'What the values mean, used to format them and to validate goal targets. One of: number, count, ratio (a 0-1 fraction, shown as a percent: declare it for conversion rates so 0.08 displays as 8%), percent (already 0-100), currency (the project currency) or "currency:XXX" (ISO 4217, e.g. "currency:USD"), duration_seconds. Declare it: it cannot be inferred from a formula (a ROI ratio can exceed 1). Omit on register for a plain number; on evolve, omit to keep the current unit and pass null to clear it.',
    ),
};

const schemaDefinitionInputShape = {
  kind: z.string().describe('One of: event, entity, measure. An event is something that happened; an entity is a thing with a stable id; a measure is a numeric reading with a value and a timestamp.'),
  name: z.string().min(1).describe('Schema name, e.g. "signup" or "subscription_state_change". This is the value the ingest envelope carries, and for measure/entity kinds it is also the table name a metric can query. A schema is registered project-wide, so one call covers every environment.'),
  fields: z
    .unknown()
    .describe(
      'Array of { name, type, is_required?, is_pii?, is_identity_key? }. type is one of: string, number, boolean, timestamp, object, array. A record carrying a property this list does not declare is rejected into quarantine, so declare every property you intend to send. anon_id and customer_id ride on the event envelope and are accepted without being declared - declare them only to enrol them in identity stitching, and then only with is_required false, since customer_id is absent until identify() runs and a required one would quarantine every anonymous event.',
    ),
};

/**
 * `register_schema` only — deliberately not on the shared shape, which
 * `evolve_schema` also uses. Advertising a flag a tool silently ignores is its
 * own kind of lie; evolve has no preview path yet (see KAN-119).
 */
const registerSchemaInputShape = {
  ...schemaDefinitionInputShape,
  dry_run: z
    .boolean()
    .optional()
    .describe(
      'Validate and report what would be created, writing nothing. Use this first: a schema cannot be deleted or archived, and evolve_schema is additive-only, so a misspelled field name is permanent. A name that is already taken comes back as would_conflict rather than an error, so a whole batch can be previewed in one pass.',
    ),
};

/**
 * Normalises the tool's loosely-typed `fields` argument into the service's SchemaFieldInput.
 *
 * The three booleans default to false rather than being required: the common case is a plain
 * optional property, and making a caller spell out `is_pii: false` on every field is the kind
 * of friction that pushes people back to asking a human to register the schema for them.
 */
function toSchemaFields(args: any): { name: string; type: string; isRequired: boolean; isPii: boolean; isIdentityKey: boolean }[] {
  const raw = Array.isArray(args.fields) ? args.fields : [];
  return raw.map((field: any) => ({
    name: String(field?.name ?? ''),
    type: String(field?.type ?? ''),
    isRequired: field?.is_required === true,
    isPii: field?.is_pii === true,
    isIdentityKey: field?.is_identity_key === true,
  }));
}

const archiveMetricInputShape = { name: z.string().min(1).describe('The metric family to retire. Refused while an active formula still references it.') };
const metricVersionsInputShape = { name: z.string().min(1).describe('The metric name whose version history to list — every version, not just the active one.') };
const goalIdInputShape = { goal_id: z.string().min(1).describe('Id of the goal, as returned by list_goals.') };
const goalStatusInputShape = {
  goal_id: z.string().min(1).describe('Id of the goal, as returned by list_goals.'),
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
  name: z.string().min(1).describe('Human-readable name for this receiver, e.g. "Stripe webhooks" — how it is identified in listings and audit entries.'),
  environment_id: z.string().optional().describe('Defaults to the environment this connection is bound to, or the project\'s prod environment for an OAuth connection.'),
  signature_mode: z.string().optional().describe('One of: none, hmac_sha256. Defaults to hmac_sha256 — prefer it, and set a secret straight after.'),
  signature_header_name: z.string().optional().describe('Required for hmac_sha256, e.g. X-GrowthOS-Signature or X-Hub-Signature-256. The sender must put hex HMAC-SHA256(secret, raw_body) there, optionally prefixed "sha256=".'),
};
const setHookSecretInputShape = {
  hook_endpoint_id: z.string().min(1).describe('Id of the hook endpoint, as returned by list_hook_endpoints or create_hook_endpoint.'),
  signing_secret: z.string().min(16).describe('The shared secret the sender signs with. Rotating keeps the previous secret valid for a short grace window.'),
};
const reexportInputShape = {
  schema_name: z.string().optional().describe('Restrict the backfill to one schema; omit for every schema, newest-landed first.'),
  limit: z.number().int().positive().optional().describe('Maximum records to re-export in this call. Re-exporting is idempotent, so a large backfill can be run as repeated bounded calls.'),
};
const purgeInputShape = {
  confirm_project_id: z.string().min(1).describe('Must exactly equal this connection\'s own project id. A deliberate guard: this deletes landed data irreversibly.'),
  environment_id: z.string().optional().describe('Restrict the purge to one environment; omit to clear every environment.'),
};

const setFunnelInputShape = {
  steps: z
    .array(
      z.union([
        z.string(),
        // Both spellings are accepted (B21): query_funnel used to return only camelCase, so a step read from
        // it could not be passed back here. Any other key on the object (query_funnel's step_order,
        // people_count, rates) is ignored, so its steps round-trip as they are.
        z.object({
          event_schema_name: z.string().optional().describe('A registered event schema name of this project (see list_schemas).'),
          stage_key: z.string().optional().describe(`Optional funnel stage. One of: ${FUNNEL_STAGE_KEYS.join(', ')}. Inferred from the event name when omitted.`),
          eventSchemaName: z.string().optional().describe('Same as event_schema_name (accepted so query_funnel output round-trips); event_schema_name wins if both are given.'),
          stageKey: z.string().optional().describe('Same as stage_key; stage_key wins if both are given.'),
        }),
      ]),
    )
    .describe(
      'The funnel, first step first, e.g. ["touchpoint", "signup", "document_created", "document_sent", "document_signed"]. Each entry is a registered event schema name, or { event_schema_name, stage_key } to also pick its stage (camelCase eventSchemaName/stageKey are accepted too, and the step objects query_funnel returns can be passed back as they are). At least 2 steps, each event at most once, and every name must be an active EVENT schema of this project (entity/measure schemas cannot be funnel steps). Replaces the whole funnel; it is not merged with the current one.',
    ),
  dry_run: z
    .boolean()
    .optional()
    .describe('Validate and report the funnel that would be saved (and the one it would replace), writing nothing. Needs only "mcp.read".'),
};

/** Normalises `set_funnel`'s loosely-typed `steps` (a bare name, or an object) into the service's input. Anything unrecognisable becomes an empty name, which the service then refuses with a positioned reason. */
function toFunnelStepInputs(raw: unknown): FunnelStepInput[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw.map((entry: any) => {
    if (typeof entry === 'string') {
      return { eventSchemaName: entry };
    }
    const stageKey = entry?.stage_key ?? entry?.stageKey;
    return {
      eventSchemaName: String(entry?.event_schema_name ?? entry?.eventSchemaName ?? ''),
      ...(stageKey !== undefined ? { stageKey: String(stageKey) } : {}),
    };
  });
}

function toFunnelStepOutput(steps: readonly OnboardingFunnelStep[]): Array<{ order: number; event_schema_name: string; stage_key: string }> {
  return steps.map((step) => ({ order: step.order, event_schema_name: step.eventSchemaName, stage_key: step.stageKey }));
}

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
      description: "List this project's registered event/entity/measure schemas and their declared fields. A measure or entity schema is queryable as a metric table by its own name; its columns are its fields plus the intrinsic ones. Event schemas also accept the fields in implicit_event_fields inside properties without declaring them; every other undeclared property quarantines the record.",
      inputSchema: {},
    },
    auditedToolHandler(auth, 'list_schemas', async () => {
      const schemas = await listSchemaDefinitionsForProject(auth.organizationId, auth.projectId);
      return textResult({
        // Accepted on every EVENT schema without being declared (the tracking
        // snippet attaches them to everything it sends), while any other
        // undeclared property quarantines the record. An integrator probing the
        // contract saw that asymmetry and could not tell a rule from a gap;
        // stating it here makes the rule readable where the schemas are.
        implicit_event_fields: IMPLICIT_EVENT_ENVELOPE_FIELDS.map((name) => ({
          name,
          type: 'string',
          accepted_undeclared: true,
          // Registration cannot be undone, so this must not suggest a declaration that
          // buys nothing: since the identity fix (B12) stitching reads these straight
          // from properties, declared or not.
          note: 'Accepted in properties on every event schema without being declared, and identity stitching reads it from properties whether or not it is declared. Declaring it is optional and never needed; never declare it as required.',
        })),
        schemas: schemas
          .filter((schema) => schema.status === 'active')
          .map((schema) => ({
            name: schema.name,
            kind: schema.kind,
            version: schema.version,
            // `is_pii`/`is_identity_key` are echoed because they are otherwise
            // write-only: a caller could set them on register_schema and had no
            // way to read back that they took. The first integrator to mark a
            // field PII is exactly the one who needs to confirm it.
            fields: schema.field_defs.map((field) => ({
              name: field.name,
              type: field.type,
              required: field.is_required,
              is_pii: field.is_pii,
              is_identity_key: field.is_identity_key,
            })),
          })),
      });
    }),
  );

  server.registerTool(
    'register_schema',
    {
      title: 'Register schema',
      description:
        'Register the first version (v1) of an event, entity or measure schema for this project. Until a schema exists, every record of that kind is rejected into quarantine - so this is the step that has to happen before any tracking data can land. A measure or entity schema also becomes queryable as a metric table under its own name. There is no delete or archive path for a schema and evolve_schema is additive-only, so a mistake here is permanent: pass dry_run first to check your work, and read the warnings it returns. Committing requires "schema.write"; a dry run needs only "mcp.read", so you can check a schema before you have permission to create one.',
      inputSchema: toolInputSchema(registerSchemaInputShape),
    },
    auditedToolHandler(auth, 'register_schema', async (args: any) =>
      runAdminTool(auth, requiredRegisterSchemaPermission(args), args, async (a: any) => {
        const request = {
          organizationId: auth.organizationId,
          projectId: auth.projectId,
          kind: String(a.kind),
          name: String(a.name),
          fields: toSchemaFields(a),
          createdByUserId: actorId(auth),
        };

        if (a.dry_run === true) {
          const preview = await previewSchemaDefinition(request);
          return textResult({
            dry_run: true,
            created: false,
            would_create: { name: preview.name, kind: preview.kind, version: preview.version, fields: preview.fields },
            would_conflict: preview.wouldConflict,
            warnings: preview.warnings,
          });
        }

        const schemaDef = await registerSchemaDefinition(request);
        // Warnings ride on the success response rather than blocking it: the
        // consequences they describe are legal configurations someone may intend,
        // but registration is irreversible, so this is the last moment they are
        // useful.
        const warnings = describeSchemaDefinitionWarnings(schemaDef.kind, schemaDef.field_defs);
        return textResult({ name: schemaDef.name, kind: schemaDef.kind, version: schemaDef.version, status: schemaDef.status, warnings });
      }),
    ),
  );

  server.registerTool(
    'evolve_schema',
    {
      title: 'Evolve schema',
      description:
        'Register the next version of an already-registered schema. Additive changes only - removing a field, or adding a required one, is rejected as a breaking change, because records already in flight were written against the previous version. The previous version is kept as "superseded" rather than deleted. Requires "schema.write".',
      inputSchema: toolInputSchema(schemaDefinitionInputShape),
    },
    auditedToolHandler(auth, 'evolve_schema', async (args: any) =>
      runAdminTool(auth, 'schema.write', args, async (a: any) => {
        const schemaDef = await evolveSchemaDefinition({
          organizationId: auth.organizationId,
          projectId: auth.projectId,
          kind: String(a.kind),
          name: String(a.name),
          fields: toSchemaFields(a),
          createdByUserId: actorId(auth),
        });
        return textResult({ name: schemaDef.name, kind: schemaDef.kind, version: schemaDef.version, status: schemaDef.status });
      }),
    ),
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
          unit: version.unit ?? null,
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
          ...(a.unit !== undefined ? { unit: a.unit } : {}),
          createdByUserId: actorId(auth),
        });
        return textResult({ name: metricDef.name, version: metricDef.version, status: metricDef.status, unit: metricDef.unit ?? null });
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
          ...(a.unit !== undefined ? { unit: a.unit } : {}),
          createdByUserId: actorId(auth),
        });
        return textResult({ name: metricDef.name, version: metricDef.version, status: metricDef.status, unit: metricDef.unit ?? null });
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
      const [goals, units] = await Promise.all([
        listGoalsForProject(auth.organizationId, auth.projectId),
        resolveMetricDisplayUnits(auth.organizationId, auth.projectId),
      ]);
      return textResult({
        goals: goals.map((goal) => {
          const unit = units[goal.metric_name] ?? { kind: 'number' as const };
          return {
            id: goal.id,
            name: goal.name,
            metric_name: goal.metric_name,
            metric_unit: serializeMetricUnit(unit),
            direction: goal.direction,
            target_value: goal.target_value,
            target_formatted: formattedOrNull(goal.target_value, unit),
            range_min: goal.range_min,
            range_max: goal.range_max,
            start_date: goal.start_date,
            deadline: goal.deadline,
            rhythm: goal.rhythm,
            owner_person_id: goal.owner_person_id,
            status: goal.status ?? 'active',
          };
        }),
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
      const [outcome, units] = await Promise.all([
        queryGoalProgress({ organizationId: auth.organizationId, projectId: auth.projectId, goal }),
        resolveMetricDisplayUnits(auth.organizationId, auth.projectId),
      ]);
      if (!outcome.ok) {
        return textResult({ id: goal.id, name: goal.name, available: false, reason: outcome.reason, detail: outcome.message });
      }
      const unit = units[goal.metric_name] ?? { kind: 'number' as const };
      return textResult({
        id: goal.id,
        name: goal.name,
        available: true,
        metric_unit: serializeMetricUnit(unit),
        actual_value: outcome.actualValue,
        actual_value_formatted: formattedOrNull(outcome.actualValue, unit),
        target_formatted: formattedOrNull(goal.target_value, unit),
        expected_at_now: outcome.progress.expectedAtNow,
        expected_at_now_formatted: formattedOrNull(outcome.progress.expectedAtNow, unit),
        projected_final_value: outcome.progress.projectedFinalValue,
        projected_final_value_formatted: formattedOrNull(outcome.progress.projectedFinalValue, unit),
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
    'set_funnel',
    {
      title: 'Set the project funnel',
      description:
        'Define (or replace) this project\'s confirmed funnel: the ordered event schemas query_funnel counts customers through and the web Funnel page charts. This is the same funnel the web onboarding wizard confirms, so either surface can set it and both show the result. Pass dry_run first to see the resolved funnel and the one it would replace. Committing requires "project.configure"; a dry run needs only "mcp.read".',
      inputSchema: toolInputSchema(setFunnelInputShape),
    },
    auditedToolHandler(auth, 'set_funnel', async (args: any) =>
      runAdminTool(auth, requiredSetFunnelPermission(args), args, async (a: any) => {
        const request = { organizationId: auth.organizationId, projectId: auth.projectId, steps: toFunnelStepInputs(a.steps) };

        if (a.dry_run === true) {
          const preview = await previewProjectFunnel(request);
          return textResult({
            dry_run: true,
            saved: false,
            would_set: toFunnelStepOutput(preview.steps),
            previous_steps: toFunnelStepOutput(preview.previousSteps),
            changed: preview.changed,
          });
        }

        const result = await setProjectFunnel({
          ...request,
          actorType: auth.principalKind === 'api_key' ? 'api_key' : 'user',
          actorId: actorId(auth),
        });
        return textResult({
          saved: true,
          steps: toFunnelStepOutput(result.steps),
          previous_steps: toFunnelStepOutput(result.previousSteps),
          changed: result.changed,
          next_step: 'Call query_funnel to count customers through it.',
        });
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
        'Irreversibly delete landed records and their bookkeeping — raw records, pipeline messages, ingest batches, quarantined records, dedup keys, win events and tracking alerts — so real data can start clean. Scope it with environment_id to clear one environment (e.g. dev probe debris) and leave the others untouched; omit environment_id to clear the whole project. Configuration is untouched: metrics, goals, segments, win rules, schemas, keys, hook endpoints, boards and automation targets all survive. The warehouse copy needs a separate raw-table delete plus a dbt rebuild. Requires "ingest.write" and an explicit confirm_project_id.',
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
