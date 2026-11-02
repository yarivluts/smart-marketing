import { describe, expect, it } from 'vitest';
import en from './en.json';

// Filters and scorecards read as plain sentences, like the rest of the app,
// not Title Case labels.
describe('goal and ad filters use sentence case (en)', () => {
  const goals = en.Goals as unknown as Record<string, string>;
  const ads = en.Campaigns as unknown as Record<string, string>;

  it('goal scorecards and status filter', () => {
    expect(goals.kpiTotalGoals).toBe('Active goals');
    expect(goals.kpiOnTrack).toBe('On track');
    expect(goals.kpiAtRisk).toBe('At risk');
    expect(goals.kpiAvgProgress).toBe('Average progress');
    expect(goals.filterStatusAll).toBe('All statuses');
    expect(goals.filterStatusOnTrack).toBe('On track');
    expect(goals.filterStatusAtRisk).toBe('At risk');
  });

  it('ads platform and status filters', () => {
    expect(ads.filterAllPlatforms).toBe('All platforms');
    expect(ads.filterAllStatuses).toBe('All statuses');
  });
});
