import { describe, expect, it } from 'vitest';
import { assessProdDrift, DEFAULT_PROD_DRIFT_GRACE_HOURS } from './prod-drift';

const NOW = new Date('2026-09-18T20:00:00.000Z');
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 60 * 60 * 1000).toISOString();

describe('assessProdDrift (KAN-180)', () => {
  it('is current when production is at main', () => {
    expect(
      assessProdDrift({ deployedSha: 'abc1234', mainSha: 'abc1234', undeployedCommits: [], now: NOW, graceHours: 6 }).status,
    ).toBe('current');
  });

  it('matches a short deployed SHA against a long main SHA', () => {
    expect(
      assessProdDrift({
        deployedSha: '62d2115',
        mainSha: '62d2115a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e',
        undeployedCommits: [],
        now: NOW,
        graceHours: 6,
      }).status,
    ).toBe('current');
  });

  it('is within grace for a fresh merge, so an ordinary afternoon never raises the alarm', () => {
    const result = assessProdDrift({
      deployedSha: 'aaaaaaa',
      mainSha: 'bbbbbbb',
      undeployedCommits: [{ sha: 'bbbbbbb', committedAt: hoursAgo(1) }],
      now: NOW,
      graceHours: 6,
    });
    expect(result).toMatchObject({ status: 'within_grace', behindBy: 1, oldestUndeployedAgeHours: 1 });
  });

  /**
   * The case this exists for: the dry-run fix sat merged for about a day while
   * an integrator was blocked on it, and nothing said so.
   */
  it('is drifted when a merged commit has waited past the grace period', () => {
    const result = assessProdDrift({
      deployedSha: 'aaaaaaa',
      mainSha: 'bbbbbbb',
      undeployedCommits: [{ sha: 'bbbbbbb', committedAt: hoursAgo(24) }],
      now: NOW,
      graceHours: 6,
    });
    expect(result).toMatchObject({ status: 'drifted', behindBy: 1, oldestUndeployedAgeHours: 24 });
    expect(result.message).toContain('docs/deploy-api.md');
  });

  /**
   * Measured from the OLDEST undeployed commit, not the newest. Otherwise a
   * steady trickle of merges keeps resetting the clock and a stale production
   * is never reported — the exact silence this is meant to end.
   */
  it('is not reset by a fresh merge landing on top of an old undeployed one', () => {
    const result = assessProdDrift({
      deployedSha: 'aaaaaaa',
      mainSha: 'ccccccc',
      undeployedCommits: [
        { sha: 'ccccccc', committedAt: hoursAgo(0.1) },
        { sha: 'bbbbbbb', committedAt: hoursAgo(30) },
      ],
      now: NOW,
      graceHours: 6,
    });
    expect(result).toMatchObject({ status: 'drifted', behindBy: 2, oldestUndeployedAgeHours: 30 });
  });

  /**
   * A distinct state, not folded into either answer. Calling an unstamped
   * production "current" would hide exactly the drift this detects; calling it
   * "drifted" would cry wolf about something unknown.
   */
  it('reports unstamped rather than guessing when production gives no build SHA', () => {
    const result = assessProdDrift({
      deployedSha: null,
      mainSha: 'bbbbbbb',
      undeployedCommits: [{ sha: 'bbbbbbb', committedAt: hoursAgo(48) }],
      now: NOW,
      graceHours: 6,
    });
    expect(result).toMatchObject({ status: 'unstamped', behindBy: null, oldestUndeployedAgeHours: null });
  });

  it('sets the default grace so a day-long wait, like the one that prompted this, is caught', () => {
    expect(DEFAULT_PROD_DRIFT_GRACE_HOURS).toBeLessThan(24);
    expect(DEFAULT_PROD_DRIFT_GRACE_HOURS).toBeGreaterThanOrEqual(2);
  });
});
