import { describe, expect, it } from 'vitest';
import en from './en.json';
import he from './he.json';

describe('resource library connections speak plainly', () => {
  it('English says account connections and permissions, not credentials and scopes', () => {
    for (const ns of [en.ResourceLibrary, en.ProjectResources]) {
      expect(ns.credentialsHeading).toBe('Account connections');
      expect(ns.noCredentials).not.toMatch(/credential/i);
    }
    expect(en.ResourceLibrary.credentialSummary).not.toMatch(/available scopes/i);
    expect(en.ResourceLibrary.credentialSummary).toMatch(/permission/);
  });

  it('Hebrew uses the same plain words with a singular form', () => {
    for (const ns of [he.ResourceLibrary, he.ProjectResources]) {
      expect(ns.credentialsHeading).toBe('חיבורי חשבון');
      expect(ns.noCredentials).not.toMatch(/אישורי התחברות/);
    }
    expect(he.ResourceLibrary.credentialSummary).toMatch(/הרשאה אחת/);
    expect(he.ResourceLibrary.credentialSummary).not.toMatch(/היקפ/);
  });
});
