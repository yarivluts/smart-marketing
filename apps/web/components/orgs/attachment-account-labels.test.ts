import { describe, expect, it } from 'vitest';
import en from '../../messages/en.json';
import he from '../../messages/he.json';

// Hebrew is written as escapes: code files never hold Hebrew text.
const HE_SCOPES_WORD = 'היקפים';

describe('resource attachment scope inputs speak of accounts, not scopes', () => {
  it('English labels avoid the word "scope"', () => {
    for (const label of [en.ProjectResources.scopeSelectionLabel, en.ResourceLibrary.pushScopeSelectionLabel]) {
      expect(label.toLowerCase()).not.toContain('scope');
      expect(label).toMatch(/^Accounts to (request|share)/);
    }
  });

  it('Hebrew labels avoid the technical word for scopes', () => {
    for (const label of [he.ProjectResources.scopeSelectionLabel, he.ResourceLibrary.pushScopeSelectionLabel]) {
      expect(label).not.toContain(HE_SCOPES_WORD);
    }
  });
});
