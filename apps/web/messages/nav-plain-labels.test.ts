import { describe, expect, it } from 'vitest';
import en from './en.json';
import he from './he.json';

describe('Sidebar link names for the audit log and plugins', () => {
  it('uses plain English names', () => {
    expect(en.OrgDetailPage.auditLogLink).toBe('Change history');
    expect(en.OrgDetailPage.pluginRegistryLink).toBe('Connection library');
    expect(en.OrgDetailPage.projectPluginsLink).toBe('Ready-made connections');
    for (const text of [en.OrgDetailPage.auditLogLink, en.OrgDetailPage.pluginRegistryLink, en.OrgDetailPage.projectPluginsLink]) {
      expect(text).not.toMatch(/audit|registry|plugin/i);
    }
  });

  it('uses plain Hebrew names without the old terms', () => {
    expect(he.OrgDetailPage.auditLogLink).toBe(he.OrganizationSettings.relatedAudit);
    for (const text of [he.OrgDetailPage.auditLogLink, he.OrgDetailPage.pluginRegistryLink, he.OrgDetailPage.projectPluginsLink]) {
      expect(text).not.toMatch(/ביקורת|מרשם|תוספים/);
    }
  });

  it('keeps the two connection links distinct so they cannot be confused', () => {
    expect(en.OrgDetailPage.pluginRegistryLink).not.toBe(en.OrgDetailPage.projectPluginsLink);
    expect(he.OrgDetailPage.pluginRegistryLink).not.toBe(he.OrgDetailPage.projectPluginsLink);
  });
});
