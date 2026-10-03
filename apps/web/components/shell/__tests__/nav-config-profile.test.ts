import { describe, expect, it } from 'vitest';
import { buildProjectNavSections } from '@/config/nav-config';

describe('Profile-aware Navigation Filtering', () => {
  const dummyT = (k: string) => k;

  it('hides MRR waterfall and churn reasons for E-Commerce physical goods', () => {
    const sections = buildProjectNavSections('org-1', 'proj-1', dummyT, {
      businessModel: 'ecommerce_physical',
      transactionType: 'one_time',
      platformType: 'web',
    });

    const allItemIds = sections.flatMap((s) => s.items.map((i) => i.id));

    expect(allItemIds).not.toContain('billingOpsFeed');
    expect(allItemIds).not.toContain('churnReasons');
    expect(allItemIds).not.toContain('repCollections');

    // E-Commerce still has attribution, campaigns, funnel, cohorts, setup checklist
    expect(allItemIds).toContain('campaigns');
    expect(allItemIds).toContain('attribution');
    expect(allItemIds).toContain('funnel');
    expect(allItemIds).toContain('cohorts');
    expect(allItemIds).toContain('setupChecklist');
  });

  it('preserves MRR waterfall and churn reasons for SaaS subscription projects', () => {
    const sections = buildProjectNavSections('org-1', 'proj-1', dummyT, {
      businessModel: 'saas_subscription',
      transactionType: 'monthly_recurring',
      platformType: 'web',
    });

    const allItemIds = sections.flatMap((s) => s.items.map((i) => i.id));

    expect(allItemIds).toContain('billingOpsFeed');
    expect(allItemIds).toContain('churnReasons');
    expect(allItemIds).toContain('campaigns');
    expect(allItemIds).toContain('setupChecklist');
  });

  it('shows badge with verified / total count on setupChecklist item', () => {
    const sections = buildProjectNavSections('org-1', 'proj-1', dummyT, {
      businessModel: 'saas_subscription',
      verifiedRequirementsCount: 2,
      totalRequirementsCount: 4,
    });

    const checklistItem = sections
      .flatMap((s) => s.items)
      .find((i) => i.id === 'setupChecklist');

    expect(checklistItem).toBeDefined();
    expect(checklistItem?.badge).toBe('2/4');
    expect(checklistItem?.badgeVariant).toBe('warning');
  });

  it('shows success badgeVariant when all requirements are verified', () => {
    const sections = buildProjectNavSections('org-1', 'proj-1', dummyT, {
      businessModel: 'saas_subscription',
      verifiedRequirementsCount: 4,
      totalRequirementsCount: 4,
    });

    const checklistItem = sections
      .flatMap((s) => s.items)
      .find((i) => i.id === 'setupChecklist');

    expect(checklistItem?.badge).toBe('4/4');
    expect(checklistItem?.badgeVariant).toBe('success');
  });

  it('allows custom hidden modules override', () => {
    const sections = buildProjectNavSections('org-1', 'proj-1', dummyT, {
      businessModel: 'saas_subscription',
      customHiddenModules: ['sessionReplay', 'tv'],
    });

    const allItemIds = sections.flatMap((s) => s.items.map((i) => i.id));
    expect(allItemIds).not.toContain('sessionReplay');
    expect(allItemIds).not.toContain('tv');
  });
});
