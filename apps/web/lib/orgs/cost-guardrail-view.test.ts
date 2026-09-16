import { describe, expect, it } from 'vitest';
import { formatEstimatedCostUsd, formatLabels, labelsToLines, outcomeLabelKey, parseLabelsInput, toProjectCostQuotaView, toQueryCostLogEntryView, summariseLoggedCost, type QueryCostLogEntryView } from './cost-guardrail-view';

describe('formatLabels / parseLabelsInput', () => {
  it('formats an empty label set as an empty string', () => {
    expect(formatLabels({})).toBe('');
  });

  it('skips blank lines and lines with no "="', () => {
    expect(parseLabelsInput('team=growth\n\nnotalabel\ntier=internal')).toEqual({ team: 'growth', tier: 'internal' });
  });

  it('trims whitespace around keys and values', () => {
    expect(parseLabelsInput('  team = growth  ')).toEqual({ team: 'growth' });
  });

  it('drops a line with no key before "="', () => {
    expect(parseLabelsInput('=growth')).toEqual({});
  });
});

describe('labelsToLines', () => {
  it('formats an empty label set as an empty string', () => {
    expect(labelsToLines({})).toBe('');
  });

  it('round-trips a label set through labelsToLines -> parseLabelsInput', () => {
    const labels = { team: 'growth', tier: 'internal' };
    expect(parseLabelsInput(labelsToLines(labels))).toEqual(labels);
  });

  it('round-trips a label value that itself contains the literal ", " substring, unlike going through formatLabels + a naive ", " -> "\\n" replace', () => {
    const labels = { note: 'staging, temp' };
    expect(parseLabelsInput(labelsToLines(labels))).toEqual(labels);
    // The bug this regression-tests: formatLabels joins entries with ", ", so
    // naively replacing ", " with "\n" (as the form used to do) would also
    // split *inside* this value instead of only between entries.
    expect(formatLabels(labels).replaceAll(', ', '\n')).not.toBe(labelsToLines(labels));
  });
});

describe('outcomeLabelKey', () => {
  it('maps every outcome to its own translation key', () => {
    expect(outcomeLabelKey('executed')).toBe('outcomeExecuted');
    expect(outcomeLabelKey('blocked_quota_exceeded')).toBe('outcomeBlockedQuotaExceeded');
    expect(outcomeLabelKey('warehouse_not_configured')).toBe('outcomeWarehouseNotConfigured');
  });
});

describe('toProjectCostQuotaView', () => {
  it('projects a plain, serializable view', () => {
    expect(toProjectCostQuotaView({ dailyQueryLimit: 10, labels: { team: 'growth' }, setAt: '2026-01-01T00:00:00Z', setByUserId: 'user-1' })).toEqual({
      dailyQueryLimit: 10,
      labels: { team: 'growth' },
      setAt: '2026-01-01T00:00:00Z',
    });
  });
});

describe('toQueryCostLogEntryView', () => {
  it('projects a plain, serializable view, defaulting a nullish estimated cost to null', () => {
    const entry = {
      id: 'entry-1',
      outcome: 'executed' as const,
      definition_refs: { ad_spend: 'metric:ad_spend@v1' },
      executed_at: '2026-01-01T00:00:00Z',
      estimated_cost_usd: undefined,
    };
    expect(toQueryCostLogEntryView(entry as never)).toEqual({
      id: 'entry-1',
      outcome: 'executed',
      definitionRefs: { ad_spend: 'metric:ad_spend@v1' },
      executedAt: '2026-01-01T00:00:00Z',
      estimatedCostUsd: null,
    });
  });

  it('passes through a real estimated cost unchanged', () => {
    const entry = {
      id: 'entry-2',
      outcome: 'executed' as const,
      definition_refs: {},
      executed_at: '2026-01-01T00:00:00Z',
      estimated_cost_usd: 1.23,
    };
    expect(toQueryCostLogEntryView(entry as never).estimatedCostUsd).toBe(1.23);
  });
});

describe('formatEstimatedCostUsd', () => {
  it('formats to 4 decimal places with a leading dollar sign', () => {
    expect(formatEstimatedCostUsd(6.25)).toBe('$6.2500');
  });

  it('keeps small fractional-cent costs visible instead of rounding to $0.00', () => {
    expect(formatEstimatedCostUsd(0.0003)).toBe('$0.0003');
  });

  it('formats zero cost explicitly', () => {
    expect(formatEstimatedCostUsd(0)).toBe('$0.0000');
  });
});

/**
 * The page is called Cost Guardrails and the guardrail it enforces is a query COUNT - the daily
 * limit is a number of attempts, not a spend cap. Every executed query logs a real
 * estimatedCostUsd derived from the bytes BigQuery reported processing, and the page printed
 * each one individually and never added them up, so the one question its name promises to
 * answer was the one it did not.
 */
describe('summariseLoggedCost', () => {
  const entry = (estimatedCostUsd: number | null, id = Math.random().toString(36).slice(2)): QueryCostLogEntryView => ({
    id,
    outcome: 'executed',
    definitionRefs: {},
    executedAt: '2026-09-16T00:00:00.000Z',
    estimatedCostUsd,
  });

  it('totals the entries that carry an estimate', () => {
    expect(summariseLoggedCost([entry(0.25), entry(0.5)])).toEqual({
      totalUsd: 0.75,
      entriesWithCost: 2,
      totalEntries: 2,
      isPartial: false,
    });
  });

  it('flags the total as partial when some entries have no estimate', () => {
    // An entry has no estimate when it ran on an executor that does not report bytes processed,
    // or never executed at all. Those contribute nothing, so the total is a lower bound - and
    // a spend figure that silently omits inputs is worse than none, because it gets budgeted against.
    const summary = summariseLoggedCost([entry(1), entry(null), entry(null)]);
    expect(summary.totalUsd).toBe(1);
    expect(summary.entriesWithCost).toBe(1);
    expect(summary.totalEntries).toBe(3);
    expect(summary.isPartial).toBe(true);
  });

  it('is not partial when nothing carries an estimate - there is no total to qualify', () => {
    const summary = summariseLoggedCost([entry(null), entry(null)]);
    expect(summary.entriesWithCost).toBe(0);
    expect(summary.isPartial).toBe(false);
  });

  it('treats a measured zero as a real estimate, not a missing one', () => {
    const summary = summariseLoggedCost([entry(0)]);
    expect(summary.entriesWithCost).toBe(1);
    expect(summary.totalUsd).toBe(0);
    expect(summary.isPartial).toBe(false);
  });

  it('returns an empty summary for no entries', () => {
    expect(summariseLoggedCost([])).toEqual({ totalUsd: 0, entriesWithCost: 0, totalEntries: 0, isPartial: false });
  });
});
