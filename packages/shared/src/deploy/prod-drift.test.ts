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

/**
 * dbt-refresh is built from packages/dbt-transform alone, so the check narrows the
 * undeployed commits to that path (KAN-204). The decision stays the same function of
 * the commits; the message has to say what was counted, or "current" at a SHA far
 * behind main reads like a bug in the check.
 */
describe('assessProdDrift with watchedPaths (KAN-204)', () => {
  const watchedPaths = ['packages/dbt-transform', 'deploy/cloudbuild.dbt.yaml'];

  it('is current when main has moved on only outside the watched paths, and says so', () => {
    const result = assessProdDrift({ deployedSha: 'aaaaaaa', mainSha: 'bbbbbbb', undeployedCommits: [], now: NOW, graceHours: 6, watchedPaths });
    expect(result).toMatchObject({ status: 'current', behindBy: 0 });
    expect(result.message).toBe('Production is at aaaaaaa; main (bbbbbbb) has no later change to packages/dbt-transform, deploy/cloudbuild.dbt.yaml.');
  });

  it('keeps the plain message when production is at main itself', () => {
    const result = assessProdDrift({ deployedSha: 'bbbbbbb', mainSha: 'bbbbbbb', undeployedCommits: [], now: NOW, graceHours: 6, watchedPaths });
    expect(result.message).toBe('Production is at bbbbbbb, which is main.');
  });

  it('counts only the watched commits when they are overdue, and names the paths', () => {
    const result = assessProdDrift({
      deployedSha: 'aaaaaaa',
      mainSha: 'ddddddd',
      undeployedCommits: [{ sha: 'ccccccc', committedAt: hoursAgo(15 * 24) }],
      now: NOW,
      graceHours: 6,
      watchedPaths,
    });
    expect(result).toMatchObject({ status: 'drifted', behindBy: 1, oldestUndeployedAgeHours: 360 });
    expect(result.message).toContain('1 commit(s) touching packages/dbt-transform, deploy/cloudbuild.dbt.yaml behind main (ddddddd)');
  });

  it('phrases a within-grace wait the same way', () => {
    const result = assessProdDrift({
      deployedSha: 'aaaaaaa',
      mainSha: 'ddddddd',
      undeployedCommits: [{ sha: 'ccccccc', committedAt: hoursAgo(1) }],
      now: NOW,
      graceHours: 6,
      watchedPaths: ['packages/dbt-transform'],
    });
    expect(result.status).toBe('within_grace');
    expect(result.message).toMatch(/^Production is 1 commit\(s\) touching packages\/dbt-transform behind main/);
  });

  it('treats an empty watchedPaths as unfiltered', () => {
    const result = assessProdDrift({ deployedSha: 'aaaaaaa', mainSha: 'bbbbbbb', undeployedCommits: [], now: NOW, graceHours: 6, watchedPaths: [] });
    expect(result.message).toBe('Production is at aaaaaaa, which is main.');
  });
});
