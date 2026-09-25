/* eslint-disable @typescript-eslint/no-explicit-any -- every tool callback's `args` param is `any` for the same TypeScript-compiler-limit reason `toolInputSchema` documents below; each callback narrows/validates its own `args` before use. */
import { BadRequestException } from '@nestjs/common';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import {
  getConfirmedFunnelSteps,
  getMetricCatalogDetail,
  listMetricsCatalogForProject,
  listProjectInsights,
  listSegmentsForProject,
  listWinRulesForProject,
  MetricNotRegisteredError,
  MetricTargetsUnbuiltWarehouseTableError,
  ProjectNotFoundError,
  ProjectQueryQuotaExceededError,
  queryMetrics,
  queryProjectCohortRetention,
  queryProjectFunnelSteps,
  recordAuditLogEntry,
  searchProjectCustomers,
  WarehouseNotConfiguredError,
  type FunnelStepResult,
} from '@growthos/firebase-orm-models';
import { MetricCompilerError } from '@growthos/shared';
import { parseMetricQueryRequestBody } from '../metrics/metrics-request';
import type { McpAuthContext } from './mcp-auth.guard';

/**
 * Registers KAN-75's read-tool surface (plan `12 §6.2`) on a fresh
 * {@link McpServer} scoped to one authenticated request's
 * {@link McpAuthContext} — see `mcp.controller.ts` for why a new server
 * instance is built per request rather than shared across them.
 *
 * `query_metric`/`compare_periods`/`decompose` all reuse
 * `parseMetricQueryRequestBody` (the exact parser `POST /v1/metrics/query`,
 * KAN-42, already validates against) rather than re-declaring the request
 * shape in a second, parallel validator — the same request JSON that works
 * against the REST endpoint works unchanged as one of these tools' `input`,
 * which is what the AC's "answers ... with correct numbers vs. the web app"
 * actually depends on: one validator, one compiler, one executor, for both
 * surfaces. Each tool's zod `inputSchema` below is intentionally loose
 * (`z.record(z.unknown())`-shaped, not a full structural mirror of
 * `MetricQueryRequest`): `registerTool`'s generic input-schema inference
 * hits real TypeScript compiler limits ("Type instantiation is excessively
 * deep") on a fully-typed nested shape (arrays of filter objects with an
 * enum, unions, optional/extended variants across three tools) — every
 * `.min(1)`/enum's actual validation still happens, just inside
 * `parseMetricQueryRequestBody` rather than in the zod shape itself.
 */

/**
 * Casts a zod raw-shape object to the loosest type `registerTool` accepts
 * before handing it over. `registerTool`'s generic `ZodRawShapeCompat`/
 * `AnySchema` inference (`@modelcontextprotocol/sdk`'s dual zod-3/zod-4
 * compatibility layer) hits a genuine TypeScript compiler limit ("Type
 * instantiation is excessively deep") against a concrete literal shape
 * under this monorepo's `moduleResolution: "Node"` (a repo-wide tsconfig
 * setting this one module isn't in a position to change) — `as any` here
 * sidesteps that dead end. Nothing about runtime validation is weakened:
 * the zod shape still validates real client input at the SDK's own runtime
 * layer, and every tool below narrows/validates its own `args` again
 * (`parseMetricQueryRequestBody` for the metric-query tools, manual field
 * checks for the rest) before touching Firestore/the warehouse.
 */
export function toolInputSchema(shape: Record<string, z.ZodTypeAny>): any {
  return shape;
}

export type ToolResult = { content: Array<{ type: 'text'; text: string }>; isError?: boolean };

export function textResult(value: unknown): ToolResult {
  return { content: [{ type: 'text', text: JSON.stringify(value, null, 2) }] };
}

export function errorResult(message: string): ToolResult {
  return { content: [{ type: 'text', text: message }], isError: true };
}

/**
 * One `query_funnel` step on the MCP surface (B21). Snake_case like every other MCP tool, so a step can be fed
 * straight back into `set_funnel` (which reads `event_schema_name`/`stage_key`); the camelCase keys the tool
 * used to return are kept, deprecated, for one release so existing readers do not break.
 */
export interface FunnelStepOutput {
  event_schema_name: string;
  stage_key: string;
  step_order: number;
  people_count: number;
  conversion_rate_from_first: number;
  conversion_rate_from_previous: number;
  /** @deprecated Use `event_schema_name`. */
  eventSchemaName: string;
  /** @deprecated Use `stage_key`. */
  stageKey: string;
  /** @deprecated Use `step_order`. */
  stepOrder: number;
  /** @deprecated Use `people_count`. */
  customerCount: number;
  /** @deprecated Use `conversion_rate_from_first`. */
  conversionRateFromFirst: number;
}

export function toFunnelStepOutputs(steps: readonly FunnelStepResult[]): FunnelStepOutput[] {
  return steps.map((step, index) => {
    const previousCount = index === 0 ? step.customerCount : steps[index - 1].customerCount;
    return {
      event_schema_name: step.eventSchemaName,
      stage_key: step.stageKey,
      step_order: step.stepOrder,
      people_count: step.customerCount,
      conversion_rate_from_first: step.conversionRateFromFirst,
      conversion_rate_from_previous: previousCount > 0 ? step.customerCount / previousCount : 0,
      eventSchemaName: step.eventSchemaName,
      stageKey: step.stageKey,
      stepOrder: step.stepOrder,
      customerCount: step.customerCount,
      conversionRateFromFirst: step.conversionRateFromFirst,
    };
  });
}

/** What `query_funnel` says when the project has no confirmed funnel yet (KAN-199). */
export const NO_FUNNEL_DEFINED_MESSAGE =
  'This project has no confirmed funnel yet, so there is nothing to count. Define one with set_funnel (an ordered list of at least 2 registered event schema names; pass dry_run first to check it) or confirm one in the web onboarding wizard.';

/**
 * Appends one audit-log entry for a single MCP tool call (KAN-77 AC: "every tool call lands in the
 * audit log with the principal + client identity") — every tool, read or act, goes through this one
 * function via {@link auditedToolHandler} rather than each call site building its own entry, so "every
 * call" actually means every call including permission-denied and thrown-error ones, not just the
 * mutations that already happened to call `recordAuditLogEntry` themselves (KAN-76's act tools do,
 * via `goal.service.ts`/`segment.service.ts`/`automation.service.ts` — this entry is a deliberate
 * *second*, MCP-specific record of the call itself, distinct from those tools' own domain-specific
 * `goal.create`/`segment.create`/... entries, the same "access log alongside the domain audit trail"
 * split most APM/audit systems draw).
 *
 * Best-effort (swallows its own failure) for the same reason every other secondary audit write in
 * this codebase is: a failure to log a call must never turn an otherwise-successful (or already-
 * failed) tool call into a different outcome for the caller.
 */
async function recordMcpToolCallAudit(auth: McpAuthContext, toolName: string, outcome: { isError: boolean }): Promise<void> {
  try {
    await recordAuditLogEntry({
      organizationId: auth.organizationId,
      projectId: auth.projectId,
      actorType: auth.principalKind === 'api_key' ? 'api_key' : 'user',
      actorId: (auth.principalKind === 'api_key' ? auth.apiKeyId : auth.userId) ?? 'unknown-mcp-caller',
      action: 'mcp.tool_call',
      targetType: 'mcp_tool',
      targetId: toolName,
      summary: `MCP tool call: ${toolName}${outcome.isError ? ' (error)' : ''}`,
      clientType: auth.principalKind === 'api_key' ? 'mcp_api_key' : 'mcp_oauth',
      clientId: auth.principalKind === 'api_key' ? auth.apiKeyId : auth.clientId,
    });
  } catch {
    // Best-effort — see this function's own doc comment.
  }
}

/**
 * Wraps a tool callback so every invocation — success, tool error (`isError: true`), or a thrown
 * exception — records exactly one {@link recordMcpToolCallAudit} entry before the result (or
 * exception) reaches the caller. The single wrap point every `registerTool` call in this file and
 * `mcp-act-tools.ts` goes through, so no individual tool has to remember to audit itself.
 */
export function auditedToolHandler<Args>(
  auth: McpAuthContext,
  toolName: string,
  handler: (args: Args) => Promise<ToolResult>,
): (args: Args) => Promise<ToolResult> {
  return async (args: Args) => {
    let isError = true;
    try {
      const result = await handler(args);
      isError = result.isError ?? false;
      return result;
    } finally {
      await recordMcpToolCallAudit(auth, toolName, { isError });
    }
  };
}

/**
 * Maps the well-known failure modes every warehouse-backed tool can throw to
 * a caller-readable message, the same set `MetricsController` already maps
 * to HTTP statuses — an MCP tool call has no status code, just `isError` +
 * text, so this collapses them to one place instead of repeating the same
 * `instanceof` chain per tool. Re-throws anything it doesn't recognize
 * rather than returning a generic string: `McpServer`'s own `CallToolRequest`
 * handler (`@modelcontextprotocol/sdk/server/mcp.js`) wraps every tool
 * callback in its own top-level `try/catch` and converts *any* thrown error
 * into a valid `isError: true` result carrying that error's own message —
 * the same safety net `MetricsController`'s uncaught-`throw error` relies on
 * Nest's global exception filter for. An unrecognized error here still
 * reaches the caller as a real MCP tool error, it just skips this
 * function's own caller-friendly message list.
 */
function describeMetricsError(error: unknown): string {
  if (error instanceof ProjectNotFoundError) {
    return 'Project not found.';
  }
  if (error instanceof MetricNotRegisteredError || error instanceof MetricCompilerError || error instanceof MetricTargetsUnbuiltWarehouseTableError) {
    return error.message;
  }
  if (error instanceof WarehouseNotConfiguredError) {
    return error.message;
  }
  if (error instanceof ProjectQueryQuotaExceededError) {
    return error.message;
  }
  if (error instanceof BadRequestException) {
    const response = error.getResponse();
    return typeof response === 'string' ? response : ((response as { message?: string }).message ?? error.message);
  }
  throw error;
}

/**
 * Shared body for `query_metric`/`compare_periods`/`decompose`: parse via
 * `parseMetricQueryRequestBody`, run an optional tool-specific extra check
 * (e.g. `compare_periods` requiring `time.compare`), then run the exact same
 * `queryMetrics` call and response shape all three tools share. Factored out
 * so the three `registerTool` calls below differ only in name/description/
 * extra-validation, not in three independently-maintained copies of the
 * parse-query-respond sequence.
 */
async function runMetricQueryTool(
  auth: McpAuthContext,
  args: unknown,
  extraValidate?: (request: ReturnType<typeof parseMetricQueryRequestBody>) => string | undefined,
): Promise<ToolResult> {
  try {
    const request = parseMetricQueryRequestBody(args);
    const validationError = extraValidate?.(request);
    if (validationError) {
      return errorResult(validationError);
    }
    // API-key caller: the key's bound environment; OAuth (human) caller:
    // undefined, so queryMetrics resolves the project's prod default — see
    // McpAuthContext.environmentId's own doc comment.
    const result = await queryMetrics({
      organizationId: auth.organizationId,
      projectId: auth.projectId,
      ...(auth.environmentId !== undefined ? { environmentId: auth.environmentId } : {}),
      request,
    });
    return textResult({ series: result.series, definition_refs: result.definitionRefs, cache_hit: result.cacheHit });
  } catch (error) {
    return errorResult(describeMetricsError(error));
  }
}

/**
 * A loose MCP tool input shape for the three metric-query tools — real
 * validation happens in `parseMetricQueryRequestBody`, not here (see this
 * module's own doc comment for why the shape is deliberately not a full
 * structural mirror of `MetricQueryRequest`). Deliberately a plain object
 * literal (not widened to `z.ZodRawShape`, not spread/extended per tool):
 * `registerTool`'s generic input-schema inference hits real TypeScript
 * compiler limits ("Type instantiation is excessively deep") against a
 * widened index-signature type or a per-call spread/extend — a small,
 * concrete, reused-by-reference literal is the shape the SDK's own
 * inference is built to handle cheaply.
 */
const metricQueryInputShape = {
  metric: z.unknown().describe('One metric name (string), or an array of metric names to query together.'),
  dimensions: z.unknown().optional().describe('Breakdown dimensions — each must be declared on every requested metric.'),
  filters: z.unknown().optional().describe('Array of { field, op, value } — op is one of =, !=, >, >=, <, <=, in.'),
  time: z.unknown().describe('{ start: "YYYY-MM-DD", end: "YYYY-MM-DD", grain: day|week|month|quarter|year, compare?: previous_period|previous_year }'),
};

const cohortInputShape = {
  cohort_month: z.string().optional().describe('Restrict to one cohort, e.g. "2026-01-01" (first-of-month). Omit for every cohort, newest first.'),
  conversion_event: z
    .string()
    .optional()
    .describe('Which event must fire again for a customer to count as "retained" in a later period. Omit for "any activity that period" (the default).'),
  limit: z.number().int().positive().optional().describe('Maximum cohort rows to return, newest cohort first.'),
};

const searchCustomersInputShape = {
  query: z.string().min(1).describe('Substring to look for. Matched with SQL LIKE against the entity id and against the whole properties object serialised to JSON — so it also matches property NAMES, not just values, and a short query like "e" will match almost every row. Not fuzzy and not tokenised: use a distinctive fragment.'),
  schema_name: z.string().optional().describe('Restrict to one entity schema, e.g. "customer".'),
  limit: z.number().int().positive().optional().describe('Maximum matching customers to return.'),
};

const listInsightsInputShape = {
  limit: z.number().int().positive().optional().describe('Maximum insights to return, most recent first.'),
};

const describeMetricInputShape = {
  name: z.string().describe('The metric name, as returned by list_metrics.'),
};

export function registerMcpTools(server: McpServer, auth: McpAuthContext): void {
  server.registerTool(
    'list_metrics',
    {
      title: 'List metrics',
      description: "List every metric registered in this project's active metric catalog, with lineage.",
      inputSchema: {},
    },
    auditedToolHandler(auth, 'list_metrics', async () => {
      const metrics = await listMetricsCatalogForProject(auth.organizationId, auth.projectId);
      return textResult({ metrics });
    }),
  );

  server.registerTool(
    'describe_metric',
    {
      title: 'Describe metric',
      description: 'Get the full definition (aggregation/formula, dimensions, lineage) of one registered metric by name, including requiredEvents - which event schema has to be registered and sent for this metric to count anything, since knowing the warehouse table it reads does not tell you what to emit.',
      inputSchema: toolInputSchema(describeMetricInputShape),
    },
    auditedToolHandler(auth, 'describe_metric', async (args: any) => {
      const name = String((args as { name: unknown }).name);
      const detail = await getMetricCatalogDetail(auth.organizationId, auth.projectId, name);
      if (!detail) {
        return errorResult(`No metric named "${name}" is registered and active in this project.`);
      }
      return textResult(detail);
    }),
  );

  server.registerTool(
    'query_metric',
    {
      title: 'Query metric',
      description:
        'Run a grounded query against one or more registered metrics for a date range — never generated numbers, always compiled from the metric registry and executed against the warehouse.',
      inputSchema: toolInputSchema(metricQueryInputShape),
    },
    auditedToolHandler(auth, 'query_metric', async (args: any) => runMetricQueryTool(auth, args)),
  );

  server.registerTool(
    'compare_periods',
    {
      title: 'Compare periods',
      description:
        'Query one or more metrics with a period-over-period comparison ("time.compare": previous_period or previous_year, required) — the result series is split by a "period" column for "current" vs. "prior".',
      inputSchema: toolInputSchema(metricQueryInputShape),
    },
    auditedToolHandler(auth, 'compare_periods', async (args: any) =>
      runMetricQueryTool(auth, args, (request) =>
        request.time.compare ? undefined : 'compare_periods requires "time.compare" to be "previous_period" or "previous_year".',
      ),
    ),
  );

  server.registerTool(
    'decompose',
    {
      title: 'Decompose metric',
      description:
        'Query a metric broken down by one or more dimensions ("dimensions", required, non-empty) — e.g. "what was CAC last week by channel".',
      inputSchema: toolInputSchema(metricQueryInputShape),
    },
    auditedToolHandler(auth, 'decompose', async (args: any) =>
      runMetricQueryTool(auth, args, (request) =>
        request.dimensions && request.dimensions.length > 0 ? undefined : 'decompose requires at least one entry in "dimensions".',
      ),
    ),
  );

  server.registerTool(
    'query_cohort',
    {
      title: 'Query cohort retention',
      description:
        'Query the signup-month x period-number retention matrix (cohort engine v1). Omit cohort_month to get every cohort, newest first. Omit conversion_event to count a customer as retained on any activity that period; pass a specific event name to require that exact event instead.',
      inputSchema: toolInputSchema(cohortInputShape),
    },
    auditedToolHandler(auth, 'query_cohort', async (args: any) => {
      const { cohort_month: cohortMonth, conversion_event: conversionEvent, limit } = args as {
        cohort_month?: string;
        conversion_event?: string;
        limit?: number;
      };
      try {
        const rows = await queryProjectCohortRetention({
          organizationId: auth.organizationId,
          projectId: auth.projectId,
          ...(auth.environmentId !== undefined ? { environmentId: auth.environmentId } : {}),
          cohortMonth,
          conversionEvent,
          limit,
        });
        return textResult({ rows });
      } catch (error) {
        return errorResult(describeMetricsError(error));
      }
    }),
  );

  server.registerTool(
    'query_funnel',
    {
      title: 'Query funnel',
      description:
        "Query this project's confirmed funnel: for each step, in step order, how many PEOPLE reached it having gone through every earlier step in order (people_count; a person is the customer, or the visitor before they identify - a visitor who later becomes a customer counts once), so counts never increase from one step to the next. Each step also carries conversion_rate_from_first and conversion_rate_from_previous (0..1), the event schema it counts (event_schema_name), its funnel stage (stage_key; several steps can share one) and its position (step_order). The steps can be passed straight back to set_funnel. The camelCase keys (eventSchemaName, stageKey, stepOrder, customerCount, conversionRateFromFirst) are DEPRECATED duplicates kept for one release; read the snake_case ones. A project only has a funnel once one is confirmed - with set_funnel or in the web onboarding wizard. Until then this returns status \"no_funnel_defined\" with an empty steps list and a message saying so, rather than a bare empty list that would read as a funnel nobody entered.",
      inputSchema: {},
    },
    auditedToolHandler(auth, 'query_funnel', async () => {
      try {
        const steps = await queryProjectFunnelSteps({ organizationId: auth.organizationId, projectId: auth.projectId, ...(auth.environmentId !== undefined ? { environmentId: auth.environmentId } : {}) });
        if (steps.length === 0) {
          // KAN-199: an empty list was indistinguishable from "a funnel with nobody in it", and an
          // integrator who never opened the web wizard had no way to learn a funnel must be set.
          return textResult({ status: 'no_funnel_defined', steps: [], message: NO_FUNNEL_DEFINED_MESSAGE });
        }
        return textResult({ steps: toFunnelStepOutputs(steps) });
      } catch (error) {
        // The funnel exists but could not be counted: say which funnel, so a warehouse problem is not
        // mistaken for a missing or wrong funnel definition.
        const configured = await getConfirmedFunnelSteps(auth.organizationId, auth.projectId).catch(() => []);
        const funnelNote = configured.length > 0 ? ` The confirmed funnel is: ${configured.map((step) => step.eventSchemaName).join(' -> ')}.` : '';
        return errorResult(`${describeMetricsError(error)}${funnelNote}`);
      }
    }),
  );

  server.registerTool(
    'search_customers',
    {
      title: 'Search customers',
      description:
        "Look a customer up by identifier. Despite the name this is NOT a general-purpose search: it matches a substring against the entity id or against the whole attributes object serialised to JSON, which includes the KEY names — so every row with a field called \"plan\" matches the query \"plan\", and any short or common query matches nearly everything. Use a distinctive identifier (a uid, an external id, an exact value); do not use it to explore. Returns the most recently seen matches up to limit, with has_more set when more matched than were returned — narrow the query rather than assuming the list is complete. Customer 360 is populated only by ENTITY-kind ingestion: a project sending only events has no rows here however much data it sends.",
      inputSchema: toolInputSchema(searchCustomersInputShape),
    },
    auditedToolHandler(auth, 'search_customers', async (args: any) => {
      const { query, schema_name: schemaName, limit } = args as { query: string; schema_name?: string; limit?: number };
      try {
        const page = await searchProjectCustomers({ organizationId: auth.organizationId, projectId: auth.projectId, ...(auth.environmentId !== undefined ? { environmentId: auth.environmentId } : {}), query, schemaName, limit });
        // has_more is reported because a truncated list that looks complete is
        // how a caller concludes "no such customer" from "I only saw 20 of them".
        return textResult({ results: page.results, has_more: page.hasMore, limit: page.limit });
      } catch (error) {
        return errorResult(describeMetricsError(error));
      }
    }),
  );

  server.registerTool(
    'list_insights',
    {
      title: 'List insights',
      description: 'List recent noteworthy findings for this project: active tracking-broke alerts and fired win-rule events, newest first.',
      inputSchema: toolInputSchema(listInsightsInputShape),
    },
    auditedToolHandler(auth, 'list_insights', async (args: any) => {
      const { limit } = args as { limit?: number };
      const insights = await listProjectInsights({ organizationId: auth.organizationId, projectId: auth.projectId, ...(auth.environmentId !== undefined ? { environmentId: auth.environmentId } : {}), limit });
      return textResult({ insights });
    }),
  );

  // The two read tools the EasySign audit (P-09) found missing everywhere: a
  // caller could `create_segment` but never see what segments exist, and
  // could see win *events* but never the rules that fire them. Same
  // connection-scope `mcp.read` gate as every other read tool here; both
  // are Firestore-backed config reads, no warehouse round trip.
  server.registerTool(
    'list_segments',
    {
      title: 'List segments',
      description: "List every saved segment in this project (name, entity schema, filters, work-list status) — the read side of create_segment.",
      inputSchema: {},
    },
    auditedToolHandler(auth, 'list_segments', async () => {
      const segments = await listSegmentsForProject(auth.organizationId, auth.projectId);
      return textResult({
        segments: segments.map((segment) => ({
          id: segment.id,
          name: segment.name,
          schema_name: segment.schema_name,
          filters: segment.filters,
          event_conditions: segment.event_conditions ?? [],
          status: segment.status ?? null,
          owner_person_id: segment.owner_person_id ?? null,
          created_at: segment.created_at,
        })),
      });
    }),
  );

  server.registerTool(
    'list_win_rules',
    {
      title: 'List win rules',
      description: 'List every win rule configured in this project (name, the event schema it watches, its filters, win type, active flag) — the rules behind the win_event insights list_insights reports.',
      inputSchema: {},
    },
    auditedToolHandler(auth, 'list_win_rules', async () => {
      const rules = await listWinRulesForProject(auth.organizationId, auth.projectId);
      return textResult({
        win_rules: rules.map((rule) => ({
          id: rule.id,
          name: rule.name,
          schema_name: rule.schema_name,
          filters: rule.filters,
          win_type: rule.win_type,
          active: rule.active,
          updated_at: rule.updated_at,
        })),
      });
    }),
  );
}
