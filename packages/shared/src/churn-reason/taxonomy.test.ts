import { describe, expect, it } from 'vitest';
import { clusterChurnReasons, resolveChurnReasonTheme } from './taxonomy';

describe('resolveChurnReasonTheme', () => {
  it('trusts a recognized non-other category outright, ignoring any free text', () => {
    expect(resolveChurnReasonTheme('too_expensive', 'the support team was great')).toBe('too_expensive');
  });

  it('infers a theme from free text when category is other', () => {
    expect(resolveChurnReasonTheme('other', 'it was just too expensive for us')).toBe('too_expensive');
    expect(resolveChurnReasonTheme('other', 'we switched to a competitor with better integrations')).toBe('switched_competitor');
  });

  it('falls back to other when category is other/unrecognized and no keyword matches', () => {
    expect(resolveChurnReasonTheme('other', 'not applicable')).toBe('other');
    expect(resolveChurnReasonTheme('not_a_real_category')).toBe('other');
  });

  it('falls back to other when category is other/unrecognized and no free text is given', () => {
    expect(resolveChurnReasonTheme('other')).toBe('other');
  });

  it('picks the theme with the most keyword hits on a tie-breaking basis', () => {
    // Two "missing_features" keywords vs. one "too_expensive" keyword.
    expect(resolveChurnReasonTheme('other', 'missing features we need, a bit pricey too')).toBe('missing_features');
  });
});

describe('clusterChurnReasons', () => {
  it('groups entries by resolved theme, most common first, with a deterministic tie-break', () => {
    const clusters = clusterChurnReasons([
      { category: 'too_expensive', reasonText: 'way too pricey for what we get' },
      { category: 'too_expensive' },
      { category: 'poor_support', reasonText: 'support never responded' },
    ]);

    expect(clusters).toEqual([
      { theme: 'too_expensive', reasonCount: 2, exampleReasons: ['way too pricey for what we get'] },
      { theme: 'poor_support', reasonCount: 1, exampleReasons: ['support never responded'] },
    ]);
  });

  it('never drops an entry — every input lands in some theme, including other', () => {
    const clusters = clusterChurnReasons([{ category: 'unknown_thing' }, { category: 'other', reasonText: 'not applicable' }]);
    const total = clusters.reduce((sum, cluster) => sum + cluster.reasonCount, 0);
    expect(total).toBe(2);
    expect(clusters).toEqual([{ theme: 'other', reasonCount: 2, exampleReasons: ['not applicable'] }]);
  });

  it('caps example reasons per theme at maxExamplesPerTheme', () => {
    const clusters = clusterChurnReasons(
      [
        { category: 'low_usage', reasonText: 'reason one' },
        { category: 'low_usage', reasonText: 'reason two' },
        { category: 'low_usage', reasonText: 'reason three' },
      ],
      { maxExamplesPerTheme: 2 },
    );
    expect(clusters).toEqual([{ theme: 'low_usage', reasonCount: 3, exampleReasons: ['reason one', 'reason two'] }]);
  });

  it('returns an empty array for no entries', () => {
    expect(clusterChurnReasons([])).toEqual([]);
  });
});
