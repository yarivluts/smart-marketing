import { describe, expect, it } from 'vitest';
import { suggestSegmentCandidates } from './suggest';
import type { SegmentSuggestionFieldDescriptor } from './types';

const FIXED_NOW = new Date('2026-08-22T00:00:00.000Z');

function isoOffset(days: number): string {
  return new Date(FIXED_NOW.getTime() + days * 24 * 60 * 60 * 1000).toISOString();
}

describe('suggestSegmentCandidates', () => {
  it('returns no suggestions when nothing on the schema resembles any archetype', () => {
    const fields: SegmentSuggestionFieldDescriptor[] = [
      { name: 'favorite_color', type: 'string' },
      { name: 'shoe_size', type: 'number' },
    ];

    expect(suggestSegmentCandidates(fields, { now: FIXED_NOW })).toEqual([]);
  });

  it('proposes a recently-churned suggestion from a timestamp cancellation field, with a date-relative filter', () => {
    const fields: SegmentSuggestionFieldDescriptor[] = [{ name: 'canceled_at', type: 'timestamp' }];

    const suggestions = suggestSegmentCandidates(fields, { now: FIXED_NOW });

    expect(suggestions).toEqual([
      {
        name: 'Recently churned customers',
        filters: [{ field: 'canceled_at', op: '>=', value: isoOffset(-30) }],
        confidence: 0.85,
      },
    ]);
  });

  it('builds a boolean equality filter (not a date range) when the cancellation signal is a boolean field', () => {
    const fields: SegmentSuggestionFieldDescriptor[] = [{ name: 'is_churned', type: 'boolean' }];

    const suggestions = suggestSegmentCandidates(fields, { now: FIXED_NOW });

    expect(suggestions).toEqual([
      {
        name: 'Recently churned customers',
        filters: [{ field: 'is_churned', op: '=', value: true }],
        confidence: 1,
      },
    ]);
  });

  it('ignores a cancellation-signal field of the wrong type (e.g. a string status column)', () => {
    const fields: SegmentSuggestionFieldDescriptor[] = [{ name: 'churn_reason', type: 'string' }];

    expect(suggestSegmentCandidates(fields, { now: FIXED_NOW })).toEqual([]);
  });

  it('drops a multi-concept archetype entirely when only one of its required concepts matches', () => {
    // "plan" alone (no trial-expiry timestamp field) isn't enough for "Trial users expiring soon".
    const fields: SegmentSuggestionFieldDescriptor[] = [{ name: 'plan', type: 'string' }];

    expect(suggestSegmentCandidates(fields, { now: FIXED_NOW })).toEqual([]);
  });

  it('proposes a trial-expiring-soon suggestion only once every required concept matches, ANDing both filters', () => {
    const fields: SegmentSuggestionFieldDescriptor[] = [
      { name: 'plan', type: 'string' },
      { name: 'trial_ends_at', type: 'timestamp' },
    ];

    const suggestions = suggestSegmentCandidates(fields, { now: FIXED_NOW });

    expect(suggestions).toEqual([
      {
        name: 'Trial users expiring soon',
        filters: [
          { field: 'plan', op: '=', value: 'trial' },
          { field: 'trial_ends_at', op: '<=', value: isoOffset(7) },
        ],
        confidence: 0.7,
      },
    ]);
  });

  it('proposes a high-value-customers suggestion from a monetary number field', () => {
    const fields: SegmentSuggestionFieldDescriptor[] = [{ name: 'mrr', type: 'number' }];

    expect(suggestSegmentCandidates(fields, { now: FIXED_NOW })).toEqual([
      { name: 'High-value customers', filters: [{ field: 'mrr', op: '>=', value: 100 }], confidence: 1 },
    ]);
  });

  it('proposes inactive-customers and new-signups suggestions from distinct timestamp fields', () => {
    const fields: SegmentSuggestionFieldDescriptor[] = [
      { name: 'last_active_at', type: 'timestamp' },
      { name: 'signup_at', type: 'timestamp' },
    ];

    const suggestions = suggestSegmentCandidates(fields, { now: FIXED_NOW });
    const byName = new Map(suggestions.map((s) => [s.name, s]));

    expect(byName.get('Inactive customers')).toEqual({
      name: 'Inactive customers',
      filters: [{ field: 'last_active_at', op: '<', value: isoOffset(-30) }],
      confidence: 0.7,
    });
    expect(byName.get('New signups this week')).toEqual({
      name: 'New signups this week',
      filters: [{ field: 'signup_at', op: '>=', value: isoOffset(-7) }],
      confidence: 0.85,
    });
  });

  it('breaks a tie between two equally-scoring candidate fields by keeping the first in schema order', () => {
    const fields: SegmentSuggestionFieldDescriptor[] = [
      { name: 'churned', type: 'timestamp' },
      { name: 'cancelled', type: 'timestamp' },
    ];

    const suggestions = suggestSegmentCandidates(fields, { now: FIXED_NOW });

    expect(suggestions).toHaveLength(1);
    expect(suggestions[0].filters[0].field).toBe('churned');
  });

  it('filters out a weaker (substring-tier) match once minConfidence is raised above it', () => {
    // "trial_end_marker" only hits the trial-expiry concept's substring tier (0.7), not a whole-token
    // match, so raising minConfidence above that drops the archetype entirely.
    const fields: SegmentSuggestionFieldDescriptor[] = [
      { name: 'plan', type: 'string' },
      { name: 'trial_end_marker', type: 'timestamp' },
    ];

    expect(suggestSegmentCandidates(fields, { now: FIXED_NOW, minConfidence: 0.5 })).toHaveLength(1);
    expect(suggestSegmentCandidates(fields, { now: FIXED_NOW, minConfidence: 0.8 })).toEqual([]);
  });

  it('sorts multiple suggestions by confidence descending, ties broken alphabetically by name', () => {
    const fields: SegmentSuggestionFieldDescriptor[] = [
      { name: 'mrr', type: 'number' }, // exact-token match -> confidence 1
      { name: 'last_active_at', type: 'timestamp' }, // substring-tier match -> confidence 0.7
    ];

    const suggestions = suggestSegmentCandidates(fields, { now: FIXED_NOW });

    expect(suggestions.map((s) => s.name)).toEqual(['High-value customers', 'Inactive customers']);
    expect(suggestions[0].confidence).toBeGreaterThan(suggestions[1].confidence);
  });

  it('defaults `now` to the current wall-clock time when not injected', () => {
    const fields: SegmentSuggestionFieldDescriptor[] = [{ name: 'canceled_at', type: 'timestamp' }];
    const before = Date.now();

    const [suggestion] = suggestSegmentCandidates(fields);

    const filterValue = new Date(suggestion.filters[0].value as string).getTime();
    expect(filterValue).toBeGreaterThanOrEqual(before - 30 * 24 * 60 * 60 * 1000);
    expect(filterValue).toBeLessThanOrEqual(Date.now() - 30 * 24 * 60 * 60 * 1000 + 1000);
  });
});
