import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import en from './en.json';
import he from './he.json';

describe('sidebar hints say what Ad Studio and the AI helper do', () => {
  it('has a one-line hint in English and Hebrew, in plain words', () => {
    for (const hint of [en.AppShell.adStudioHint, en.AppShell.aiCopilotAndAutomationHint]) {
      expect(hint.length).toBeGreaterThan(10);
      expect(hint).not.toMatch(/copilot|automation|creative|ad set/i);
    }
    for (const hint of [he.AppShell.adStudioHint, he.AppShell.aiCopilotAndAutomationHint]) {
      expect(hint).toMatch(/[֐-׿]/);
    }
  });

  it('the project layout shows both hints under their links', () => {
    const layout = readFileSync(join(__dirname, '../app/[locale]/orgs/[orgId]/projects/[projectId]/layout.tsx'), 'utf8');
    expect(layout).toContain("hint: tShell('adStudioHint')");
    expect(layout).toContain("hint: tShell('aiCopilotAndAutomationHint')");
  });
});
