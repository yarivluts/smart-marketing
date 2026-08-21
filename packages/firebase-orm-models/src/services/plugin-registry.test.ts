import { describe, expect, it } from 'vitest';
import { compareSemver } from './plugin-registry.service';

/**
 * `compareSemver` is what `getLatestPluginManifestVersion`'s `reduce` (and
 * `listPluginManifestsForOrg`'s sort) use to pick which registered version
 * is "latest" for install/upgrade flows. It parses each `major.minor.patch`
 * segment with `Number()` specifically so two-digit-vs-one-digit segments
 * order correctly — a regression to plain string/lexicographic comparison
 * would still pass the one case `plugin-registry.emulator.test.ts` exercises
 * ('1.0.0' vs '1.1.0') but silently misorder every case below.
 */
describe('compareSemver', () => {
  it('returns 0 for equal versions', () => {
    expect(compareSemver('1.2.3', '1.2.3')).toBe(0);
    expect(compareSemver('0.0.0', '0.0.0')).toBe(0);
  });

  it('orders by major version numerically, not lexicographically', () => {
    expect(compareSemver('10.0.0', '9.0.0')).toBeGreaterThan(0);
    expect(compareSemver('9.0.0', '10.0.0')).toBeLessThan(0);
    expect(compareSemver('2.0.0', '1.9.9')).toBeGreaterThan(0);
  });

  it('orders by minor version numerically once major versions match', () => {
    expect(compareSemver('1.10.0', '1.9.0')).toBeGreaterThan(0);
    expect(compareSemver('1.9.0', '1.10.0')).toBeLessThan(0);
    expect(compareSemver('0.10.0', '0.9.0')).toBeGreaterThan(0);
  });

  it('orders by patch version numerically once major and minor match', () => {
    expect(compareSemver('1.2.10', '1.2.9')).toBeGreaterThan(0);
    expect(compareSemver('1.2.9', '1.2.10')).toBeLessThan(0);
  });

  it('ignores a lower-priority segment once a higher-priority one already differs', () => {
    expect(compareSemver('2.0.0', '1.99.99')).toBeGreaterThan(0);
    expect(compareSemver('1.2.0', '1.1.99')).toBeGreaterThan(0);
  });

  it('sorts a mixed version list into correct numeric ascending order', () => {
    const versions = ['1.10.0', '1.2.0', '1.9.0', '2.0.0', '1.2.10', '1.2.9'];
    expect([...versions].sort(compareSemver)).toEqual(['1.2.0', '1.2.9', '1.2.10', '1.9.0', '1.10.0', '2.0.0']);
  });

  it('picks the correct latest version via the same reduce pattern getLatestPluginManifestVersion uses', () => {
    const versions = ['1.9.0', '1.10.0', '1.2.0'];
    const latest = versions.reduce((a, b) => (compareSemver(b, a) > 0 ? b : a));
    expect(latest).toBe('1.10.0');
  });
});
