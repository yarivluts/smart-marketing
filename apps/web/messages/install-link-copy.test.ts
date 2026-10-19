import { describe, expect, it } from 'vitest';
import en from './en.json';
import he from './he.json';

describe('sidebar link to the install page', () => {
  it.each([
    ['en', en],
    ['he', he],
  ] as const)('%s: says what it does and matches the page title', (_locale, messages) => {
    const m = messages as unknown as Record<string, Record<string, string>>;
    expect(m.OrgDetailPage.projectInstallLink).toBeTruthy();
    expect(m.OrgDetailPage.projectInstallLink).toBe(m.Installation.title);
    expect(m.Installation.metaTitle).toBe(m.Installation.title);
  });

  it('en: no longer the bare word "Installation"', () => {
    expect(en.OrgDetailPage.projectInstallLink).toBe('Connect your site');
  });
});
