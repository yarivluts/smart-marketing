/* eslint-disable @typescript-eslint/no-explicit-any -- every tool callback's `args` param is `any` for the same TypeScript-compiler-limit reason `toolInputSchema` documents below; each callback narrows/validates its own `args` before use. */
import { BadRequestException } from '@nestjs/common';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import {
  getMetricCatalogDetail,
  listMetricsCatalogForProject,
  listProjectInsights,
  MetricNotRegisteredError,
  ProjectNotFoundError,
  ProjectQueryQuotaExceededError,
  queryMetrics,
  queryProjectCohortRetention,
  searchProjectCustomers,
  WarehouseNotConfiguredError,
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
 *
 * `query_funnel` is not registered — see `mcp-tools.service.ts`'s own doc
 * comment for why (no backing fact table exists yet).
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
  if (error instanceof MetricNotRegisteredError || error instanceof MetricCompilerError) {
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
    const result = await queryMetrics({ organizationId: auth.organizationId, projectId: auth.projectId, request });
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
  limit: z.number().int().positive().optional(),
};

const searchCustomersInputShape = {
  query: z.string().min(1),
  schema_name: z.string().optional().describe('Restrict to one entity schema, e.g. "customer".'),
  limit: z.number().int().positive().optional(),
};

const listInsightsInputShape = {
  limit: z.number().int().positive().optional(),
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
    async () => {
      const metrics = await listMetricsCatalogForProject(auth.organizationId, auth.projectId);
      return textResult({ metrics });
    },
  );

  server.registerTool(
    'describe_metric',
    {
      title: 'Describe metric',
      description: 'Get the full definition (aggregation/formula, dimensions, lineage) of one registered metric by name.',
      inputSchema: toolInputSchema(describeMetricInputShape),
    },
    async (args: any) => {
      const name = String((args as { name: unknown }).name);
      const detail = await getMetricCatalogDetail(auth.organizationId, auth.projectId, name);
      if (!detail) {
        return errorResult(`No metric named "${name}" is registered and active in this project.`);
      }
      return textResult(detail);
    },
  );

  server.registerTool(
    'query_metric',
    {
      title: 'Query metric',
      description:
        'Run a grounded query against one or more registered metrics for a date range — never generated numbers, always compiled from the metric registry and executed against the warehouse.',
      inputSchema: toolInputSchema(metricQueryInputShape),
    },
    async (args: any) => runMetricQueryTool(auth, args),
  );

  server.registerTool(
    'compare_periods',
    {
      title: 'Compare periods',
      description:
        'Query one or more metrics with a period-over-period comparison ("time.compare": previous_period or previous_year, required) — the result series is split by a "period" column for "current" vs. "prior".',
      inputSchema: toolInputSchema(metricQueryInputShape),
    },
    async (args: any) =>
      runMetricQueryTool(auth, args, (request) =>
        request.time.compare ? undefined : 'compare_periods requires "time.compare" to be "previous_period" or "previous_year".',
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
    async (args: any) =>
      runMetricQueryTool(auth, args, (request) =>
        request.dimensions && request.dimensions.length > 0 ? undefined : 'decompose requires at least one entry in "dimensions".',
      ),
  );

  server.registerTool(
    'query_cohort',
    {
      title: 'Query cohort retention',
      description: 'Query the signup-month x period-number retention matrix (cohort engine v1). Omit cohort_month to get every cohort, newest first.',
      inputSchema: toolInputSchema(cohortInputShape),
    },
    async (args: any) => {
      const { cohort_month: cohortMonth, limit } = args as { cohort_month?: string; limit?: number };
      try {
        const rows = await queryProjectCohortRetention({ organizationId: auth.organizationId, projectId: auth.projectId, cohortMonth, limit });
        return textResult({ rows });
      } catch (error) {
        return errorResult(describeMetricsError(error));
      }
    },
  );

  server.registerTool(
    'search_customers',
    {
      title: 'Search customers',
      description: "Substring-search this project's customer/entity records (Customer 360) by id or property value.",
      inputSchema: toolInputSchema(searchCustomersInputShape),
    },
    async (args: any) => {
      const { query, schema_name: schemaName, limit } = args as { query: string; schema_name?: string; limit?: number };
      try {
        const results = await searchProjectCustomers({ organizationId: auth.organizationId, projectId: auth.projectId, query, schemaName, limit });
        return textResult({ results });
      } catch (error) {
        return errorResult(describeMetricsError(error));
      }
    },
  );

  server.registerTool(
    'list_insights',
    {
      title: 'List insights',
      description: 'List recent noteworthy findings for this project: active tracking-broke alerts and fired win-rule events, newest first.',
      inputSchema: toolInputSchema(listInsightsInputShape),
    },
    async (args: any) => {
      const { limit } = args as { limit?: number };
      const insights = await listProjectInsights({ organizationId: auth.organizationId, projectId: auth.projectId, limit });
      return textResult({ insights });
    },
  );
}
