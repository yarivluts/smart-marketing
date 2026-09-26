import { describe, expect, it } from 'vitest';
import { readBuildSha } from './build-sha';

/**
 * Shared by the API's /v1/health, the web app's /api/health and the API's report of
 * the dbt-refresh job's last-run build (KAN-180, KAN-204): one definition of
 * "stamped", so the three watched services cannot disagree about it.
 */
describe('readBuildSha', () => {
  it.each([
    ['62d2115', '62d2115'],
    ['  62D2115  ', '62d2115'],
    ['62d2115a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e', '62d2115a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e'],
  ])('accepts a git hash %s', (raw, expected) => {
    expect(readBuildSha(raw)).toBe(expected);
  });

  /**
   * A mis-set build arg must read as "not stamped", not as a commit that does
   * not exist — an unsubstituted `$SHORT_SHA` or an empty string would otherwise
   * be reported as though production were at that "commit".
   */
  it.each([[''], ['   '], ['$SHORT_SHA'], ['${_GIT_SHA}'], ['unknown'], ['abc'], ['62d2115a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e0'], [null], [undefined]])(
    'treats %s as unstamped rather than as a commit',
    (raw) => {
      expect(readBuildSha(raw as string | null | undefined)).toBeNull();
    },
  );
});
