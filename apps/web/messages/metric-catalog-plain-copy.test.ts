import { describe, expect, it } from 'vitest';
import en from './en.json';
import he from './he.json';

const HEBREW = /[֐-׿]/;

describe('The metric catalog is named in words a beginner knows', () => {
  it('English link matches the page title and drops "metric catalog"', () => {
    expect(en.OrgDetailPage.projectMetricRegistryLink).toBe(en.MetricRegistry.metaTitle);
    expect(en.OrgDetailPage.projectMetricRegistryLink).not.toMatch(/metric|catalog/i);
    expect(en.MetricRegistry.title).not.toMatch(/metric catalog/i);
    expect(en.MetricRegistry.title).toContain('{projectName}');
  });

  it('Hebrew link matches the page title, is Hebrew and keeps the project name', () => {
    expect(he.OrgDetailPage.projectMetricRegistryLink).toBe(he.MetricRegistry.metaTitle);
    expect(he.OrgDetailPage.projectMetricRegistryLink).toMatch(HEBREW);
    expect(he.OrgDetailPage.projectMetricRegistryLink).not.toMatch(/קטלוג/);
    expect(he.MetricRegistry.title).toContain('{projectName}');
  });
});
