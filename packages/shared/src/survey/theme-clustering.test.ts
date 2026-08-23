import { describe, expect, it } from 'vitest';
import { clusterFeedbackThemes } from './theme-clustering';

describe('clusterFeedbackThemes', () => {
  it('returns an empty list for no comments', () => {
    expect(clusterFeedbackThemes([])).toEqual([]);
  });

  it('groups comments by theme, most common first', () => {
    const clusters = clusterFeedbackThemes([
      'Way too expensive for what we get',
      'Pricing is too high for our team size',
      'Support takes forever to respond to tickets',
      'The app crashes constantly, so many bugs',
    ]);
    expect(clusters).toEqual([
      { theme: 'pricing', commentCount: 2, exampleComments: ['Way too expensive for what we get', 'Pricing is too high for our team size'] },
      { theme: 'bugs', commentCount: 1, exampleComments: ['The app crashes constantly, so many bugs'] },
      { theme: 'support', commentCount: 1, exampleComments: ['Support takes forever to respond to tickets'] },
    ]);
  });

  it('drops comments that match no theme keyword from the digest', () => {
    const clusters = clusterFeedbackThemes(['Great job everyone, keep it up!']);
    expect(clusters).toEqual([]);
  });

  it('assigns a comment to the theme with the most keyword hits when it mentions more than one', () => {
    // "slow" (performance, 1 hit) vs "bug"/"crash" (bugs, 2 hits) -> bugs wins.
    const clusters = clusterFeedbackThemes(['The app is slow and keeps having bugs and crashes']);
    expect(clusters).toHaveLength(1);
    expect(clusters[0].theme).toBe('bugs');
  });

  it('caps example comments at maxExamplesPerTheme', () => {
    const clusters = clusterFeedbackThemes(
      ['too expensive', 'very costly', 'pricing is rough', 'cost is high'],
      { maxExamplesPerTheme: 2 },
    );
    expect(clusters[0].commentCount).toBe(4);
    expect(clusters[0].exampleComments).toHaveLength(2);
  });
});
