import { describe, expect, it } from 'vitest';
import { clusterCancellationReasonComments, computeCancellationReasonCodeBreakdown } from './reason-clustering';

describe('clusterCancellationReasonComments', () => {
  it('returns an empty list for no comments', () => {
    expect(clusterCancellationReasonComments([])).toEqual([]);
  });

  it('groups comments by theme, most common first', () => {
    const clusters = clusterCancellationReasonComments([
      'Way too expensive for what we get',
      'Pricing is too high for our team size',
      'We switched to a competitor with a better price',
      'The app keeps crashing, so many bugs',
    ]);
    expect(clusters).toEqual([
      { theme: 'pricing', commentCount: 2, exampleComments: ['Way too expensive for what we get', 'Pricing is too high for our team size'] },
      { theme: 'bugs', commentCount: 1, exampleComments: ['The app keeps crashing, so many bugs'] },
      { theme: 'competitor', commentCount: 1, exampleComments: ['We switched to a competitor with a better price'] },
    ]);
  });

  it('drops comments that match no theme keyword from the digest', () => {
    expect(clusterCancellationReasonComments(['Thanks for everything, it was fun while it lasted!'])).toEqual([]);
  });

  it('assigns a comment to the theme with the most keyword hits when it mentions more than one', () => {
    // "expensive" (pricing, 1 hit) vs "bug"/"crash" (bugs, 2 hits) -> bugs wins.
    const clusters = clusterCancellationReasonComments(['Too expensive and also the app has bugs and crashes constantly']);
    expect(clusters).toHaveLength(1);
    expect(clusters[0].theme).toBe('bugs');
  });

  it('caps example comments at maxExamplesPerTheme', () => {
    const clusters = clusterCancellationReasonComments(
      ['too expensive', 'very costly', 'pricing is rough', 'over our budget'],
      { maxExamplesPerTheme: 2 },
    );
    expect(clusters[0].commentCount).toBe(4);
    expect(clusters[0].exampleComments).toHaveLength(2);
  });
});

describe('computeCancellationReasonCodeBreakdown', () => {
  it('returns an empty list for no reason codes', () => {
    expect(computeCancellationReasonCodeBreakdown([])).toEqual([]);
  });

  it('counts each reason code, most common first, ties broken alphabetically', () => {
    const breakdown = computeCancellationReasonCodeBreakdown([
      'too_expensive',
      'too_expensive',
      'missing_features',
      'poor_support',
      'poor_support',
    ]);
    expect(breakdown).toEqual([
      { reasonCode: 'poor_support', count: 2 },
      { reasonCode: 'too_expensive', count: 2 },
      { reasonCode: 'missing_features', count: 1 },
    ]);
  });
});
