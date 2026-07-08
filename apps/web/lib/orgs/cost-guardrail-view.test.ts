import { describe, expect, it } from 'vitest';
import { formatLabels, labelsToLines, outcomeLabelKey, parseLabelsInput, toProjectCostQuotaView, toQueryCostLogEntryView } from './cost-guardrail-view';

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
});
