/** The subset of `@modelcontextprotocol/sdk`'s `Client` this module actually calls — kept narrow so tests can pass a plain fake instead of standing up a real MCP connection. A real SDK `Client` satisfies this structurally. */
export interface ToolCaller {
  callTool(params: { name: string; arguments?: Record<string, unknown> }): Promise<{
    content: Array<{ type: string; text?: string }>;
    isError?: boolean;
  }>;
}

export class McpToolCallError extends Error {
  constructor(
    public readonly toolName: string,
    message: string,
  ) {
    super(message);
    this.name = 'McpToolCallError';
  }
}

/**
 * Calls one GrowthOS MCP tool and parses its result the way every tool in
 * `apps/api/src/mcp/mcp-tools.ts`/`mcp-act-tools.ts` actually replies:
 * a single JSON-encoded text content block on success, `isError: true` plus
 * a plain-text message on failure (see `textResult`/`errorResult` there).
 */
export async function callGrowthOsTool<T>(client: ToolCaller, name: string, args: Record<string, unknown> = {}): Promise<T> {
  const result = await client.callTool({ name, arguments: args });
  const text = result.content
    .filter((block): block is { type: 'text'; text: string } => block.type === 'text' && typeof block.text === 'string')
    .map((block) => block.text)
    .join('\n');
  if (result.isError) {
    throw new McpToolCallError(name, text || `Tool "${name}" failed with no message.`);
  }
  return JSON.parse(text) as T;
}

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export interface WeeklyMetricDigestOptions {
  /** A metric name from `list_metrics`, e.g. "cac". */
  metric: string;
  /** Trailing window size in days. Defaults to 7 (the plan's own "every Monday ... last week's CAC" example). */
  days?: number;
  /** Overridable for tests; defaults to the real current time. */
  now?: Date;
}

export interface WeeklyMetricDigestResult {
  metric: string;
  rangeStart: string;
  rangeEnd: string;
  series: unknown[];
  definitionRefs: unknown;
}

/**
 * The recipe from plan `12 §6`'s own example — "every Monday my agent pulls
 * last week's CAC and drafts the budget memo" — minus the memo drafting
 * (out of scope for a wire-protocol example): calls `query_metric` for the
 * trailing `days`-day window ending yesterday (UTC) — today's own day is
 * usually still landing — and returns the grounded series GrowthOS actually
 * computed, never a generated number.
 */
export async function fetchWeeklyMetricDigest(client: ToolCaller, options: WeeklyMetricDigestOptions): Promise<WeeklyMetricDigestResult> {
  const days = options.days ?? 7;
  if (days < 1) {
    throw new RangeError('"days" must be at least 1.');
  }
  const now = options.now ?? new Date();
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 1));
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - (days - 1));

  const result = await callGrowthOsTool<{ series: unknown[]; definition_refs: unknown }>(client, 'query_metric', {
    metric: options.metric,
    time: { start: isoDate(start), end: isoDate(end), grain: 'day' },
  });

  return {
    metric: options.metric,
    rangeStart: isoDate(start),
    rangeEnd: isoDate(end),
    series: result.series,
    definitionRefs: result.definition_refs,
  };
}
