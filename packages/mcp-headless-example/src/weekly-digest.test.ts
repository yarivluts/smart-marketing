import { describe, expect, it } from 'vitest';
import { callGrowthOsTool, fetchWeeklyMetricDigest, McpToolCallError, type ToolCaller } from './weekly-digest';

function fakeToolCaller(
  handler: (name: string, args: Record<string, unknown> | undefined) => { content: Array<{ type: string; text: string }>; isError?: boolean },
): ToolCaller {
  return {
    callTool: async ({ name, arguments: args }) => handler(name, args),
  };
}

describe('callGrowthOsTool', () => {
  it('parses the JSON text content of a successful tool result', async () => {
    const client = fakeToolCaller(() => ({ content: [{ type: 'text', text: JSON.stringify({ ok: true }) }] }));
    await expect(callGrowthOsTool(client, 'list_metrics')).resolves.toEqual({ ok: true });
  });

  it('throws McpToolCallError carrying the tool text when isError is true', async () => {
    const client = fakeToolCaller(() => ({
      content: [{ type: 'text', text: 'No metric named "bogus" is registered.' }],
      isError: true,
    }));
    const error = await callGrowthOsTool(client, 'query_metric').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(McpToolCallError);
    expect((error as McpToolCallError).toolName).toBe('query_metric');
    expect((error as Error).message).toBe('No metric named "bogus" is registered.');
  });
});

describe('fetchWeeklyMetricDigest', () => {
  it('queries the trailing 7-day window ending yesterday (UTC) and passes the metric name through', async () => {
    let seenName: string | undefined;
    let seenArgs: Record<string, unknown> | undefined;
    const client = fakeToolCaller((name, args) => {
      seenName = name;
      seenArgs = args;
      return {
        content: [{ type: 'text', text: JSON.stringify({ series: [{ date: '2026-07-06', value: 42 }], definition_refs: ['cac@1'] }) }],
      };
    });

    const result = await fetchWeeklyMetricDigest(client, { metric: 'cac', now: new Date('2026-07-13T09:00:00Z') });

    expect(seenName).toBe('query_metric');
    expect(seenArgs).toEqual({ metric: 'cac', time: { start: '2026-07-06', end: '2026-07-12', grain: 'day' } });
    expect(result).toEqual({
      metric: 'cac',
      rangeStart: '2026-07-06',
      rangeEnd: '2026-07-12',
      series: [{ date: '2026-07-06', value: 42 }],
      definitionRefs: ['cac@1'],
    });
  });

  it('supports a custom "days" window', async () => {
    let seenArgs: Record<string, unknown> | undefined;
    const client = fakeToolCaller((_name, args) => {
      seenArgs = args;
      return { content: [{ type: 'text', text: JSON.stringify({ series: [], definition_refs: [] }) }] };
    });

    await fetchWeeklyMetricDigest(client, { metric: 'mrr', days: 1, now: new Date('2026-07-13T09:00:00Z') });

    expect(seenArgs).toEqual({ metric: 'mrr', time: { start: '2026-07-12', end: '2026-07-12', grain: 'day' } });
  });

  it('rejects a non-positive "days" before calling the tool', async () => {
    const client = fakeToolCaller(() => ({ content: [] }));
    await expect(fetchWeeklyMetricDigest(client, { metric: 'cac', days: 0 })).rejects.toThrow(RangeError);
  });

  it('surfaces McpToolCallError when the underlying query_metric call fails (e.g. unregistered metric)', async () => {
    const client = fakeToolCaller(() => ({ content: [{ type: 'text', text: 'No metric named "bogus" is registered.' }], isError: true }));
    await expect(fetchWeeklyMetricDigest(client, { metric: 'bogus', now: new Date('2026-07-13T09:00:00Z') })).rejects.toThrow(McpToolCallError);
  });
});
