import { describe, expect, it } from 'vitest';
import en from './en.json';
import he from './he.json';

describe('the AI helper is named the same everywhere, without the word "automation"', () => {
  it('uses one short name in the sidebar and and in the command search', () => {
    expect(en.AppShell.aiCopilotAndAutomation).toBe('AI helper');
    expect(en.CommandPalette.items.automation.title).toBe('AI helper');
    expect(he.AppShell.aiCopilotAndAutomation).toBe('עוזר AI');
    expect(he.CommandPalette.items.automation.title).toBe('עוזר AI');
  });
});
