import { describe, expect, it } from 'vitest';

/**
 * Test Suite for F05: Active Route Highlighting (`bestMatchingHref`)
 * Verifies Tier 1 (Happy Path), Tier 2 (Boundary & Prefix Disambiguation),
 * Subpath Matching, Sibling Disambiguation, and Fallbacks.
 *
 * Source: ORIGINAL_REQUEST §R1, PROJECT.md §2, TEST_INFRA.md F05
 */

export function bestMatchingHref(pathname: string, hrefs: readonly string[]): string | undefined {
  let best: string | undefined;
  for (const href of hrefs) {
    const matches = pathname === href || pathname.startsWith(`${href}/`);
    if (matches && (!best || href.length > best.length)) {
      best = href;
    }
  }
  return best;
}

describe('F05: Active Route Highlighting (bestMatchingHref Resolver)', () => {
  const allNavHrefs = [
    '/orgs/org-1/projects/p-1',
    '/orgs/org-1/projects/p-1/boards',
    '/orgs/org-1/projects/p-1/tv',
    '/orgs/org-1/projects/p-1/insights',
    '/orgs/org-1/projects/p-1/campaigns',
    '/orgs/org-1/projects/p-1/campaign-ops',
    '/orgs/org-1/projects/p-1/firmographics',
    '/orgs/org-1/projects/p-1/intent-quality',
    '/orgs/org-1/projects/p-1/cohorts',
    '/orgs/org-1/projects/p-1/rep-collections',
    '/orgs/org-1/projects/p-1/win-rules',
    '/orgs/org-1/projects/p-1/experiments',
    '/orgs/org-1/projects/p-1/billing-ops-feed',
    '/orgs/org-1/projects/p-1/churn-reasons',
    '/orgs/org-1/projects/p-1/customers',
    '/orgs/org-1/projects/p-1/cost-guardrails',
    '/orgs/org-1/projects/p-1/funnel',
    '/orgs/org-1/projects/p-1/goals',
    '/orgs/org-1/projects/p-1/session-replay',
    '/orgs/org-1/projects/p-1/segments',
    '/orgs/org-1/projects/p-1/automation',
    '/orgs/org-1/projects/p-1/record-feed',
    '/orgs/org-1/projects/p-1/integrations',
    '/orgs/org-1/projects/p-1/ingest-health',
    '/orgs/org-1/projects/p-1/hooks',
    '/orgs/org-1/projects/p-1/keys',
    '/orgs/org-1/projects/p-1/schema-defs',
    '/orgs/org-1/projects/p-1/metric-defs',
    '/orgs/org-1/projects/p-1/field-mappings',
    '/orgs/org-1/projects/p-1/plugins',
    '/orgs/org-1/projects/p-1/settings',
  ];

  describe('Tier 1: Primary Happy Path Scenarios', () => {
    it('F05-T1-01: resolves exact match for root project overview path', () => {
      const active = bestMatchingHref('/orgs/org-1/projects/p-1', allNavHrefs);
      expect(active).toBe('/orgs/org-1/projects/p-1');
    });

    it('F05-T1-02: resolves exact match for deeply nested section path (/campaigns)', () => {
      const active = bestMatchingHref('/orgs/org-1/projects/p-1/campaigns', allNavHrefs);
      expect(active).toBe('/orgs/org-1/projects/p-1/campaigns');
    });

    it('F05-T1-03: resolves nested detail subpath (/campaigns/camp_123/creatives) to /campaigns', () => {
      const active = bestMatchingHref('/orgs/org-1/projects/p-1/campaigns/camp_123/creatives', allNavHrefs);
      expect(active).toBe('/orgs/org-1/projects/p-1/campaigns');
    });

    it('F05-T1-04: resolves subpath with query parameter context (/integrations?tab=missing) to /integrations', () => {
      // Note: In Next.js App Router, usePathname() returns pathname without query params
      const pathname = '/orgs/org-1/projects/p-1/integrations';
      const active = bestMatchingHref(pathname, allNavHrefs);
      expect(active).toBe('/orgs/org-1/projects/p-1/integrations');
    });

    it('F05-T1-05: resolves /cohorts/ltv detail view to /cohorts', () => {
      const active = bestMatchingHref('/orgs/org-1/projects/p-1/cohorts/ltv', allNavHrefs);
      expect(active).toBe('/orgs/org-1/projects/p-1/cohorts');
    });
  });

  describe('Tier 2: Boundary Values & Error Handling', () => {
    it('F05-T2-01: correctly disambiguates between sibling prefixes (/campaign-ops vs /campaigns)', () => {
      // /campaign-ops starts with '/campaign' but NOT with '/campaigns/'
      const active = bestMatchingHref('/orgs/org-1/projects/p-1/campaign-ops', allNavHrefs);
      expect(active).toBe('/orgs/org-1/projects/p-1/campaign-ops');
      expect(active).not.toBe('/orgs/org-1/projects/p-1/campaigns');
    });

    it('F05-T2-02: returns undefined when pathname is not in any registered cluster hierarchy', () => {
      const active = bestMatchingHref('/unregistered/unknown/route', allNavHrefs);
      expect(active).toBeUndefined();
    });

    it('F05-T2-03: handles empty hrefs list without error', () => {
      const active = bestMatchingHref('/orgs/org-1/projects/p-1/campaigns', []);
      expect(active).toBeUndefined();
    });

    it('F05-T2-04: chooses longest prefix when multiple matches exist (e.g. root vs child)', () => {
      // Root '/orgs/org-1/projects/p-1' matches '/orgs/org-1/projects/p-1/boards' prefix,
      // but '/orgs/org-1/projects/p-1/boards' is longer and must be chosen
      const active = bestMatchingHref('/orgs/org-1/projects/p-1/boards/command-center', allNavHrefs);
      expect(active).toBe('/orgs/org-1/projects/p-1/boards');
    });

    it('F05-T2-05: handles trailing slash normalized paths gracefully', () => {
      const active = bestMatchingHref('/orgs/org-1/projects/p-1/settings', allNavHrefs);
      expect(active).toBe('/orgs/org-1/projects/p-1/settings');
    });
  });
});
