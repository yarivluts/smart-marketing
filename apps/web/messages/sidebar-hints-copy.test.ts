import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import en from './en.json';
import he from './he.json';

describe('sidebar hints say what Ad Studio and the AI helper do', () => {
  it('has a one-line hint in English and Hebrew, in plain words', () => {
    for (const hint of [en.AppShell.adStudioHint, en.AppShell.aiCopilotAndAutomationHint, en.AppShell.adsAndPerformanceHint, en.AppShell.funnelAndGoalsHint]) {
      expect(hint.length).toBeGreaterThan(10);
      expect(hint).not.toMatch(/copilot|automation|creative|ad set|funnel|CTR|CPC/i);
    }
    for (const hint of [he.AppShell.adStudioHint, he.AppShell.aiCopilotAndAutomationHint, he.AppShell.adsAndPerformanceHint, he.AppShell.funnelAndGoalsHint]) {
      expect(hint).toMatch(/[֐-׿]/);
    }
  });

  it('the project layout shows both hints under their links', () => {
    const layout = readFileSync(join(__dirname, '../app/[locale]/orgs/[orgId]/projects/[projectId]/layout.tsx'), 'utf8');
    expect(layout).toContain("hint: tShell('adStudioHint')");
    expect(layout).toContain("hint: tShell('aiCopilotAndAutomationHint')");
    expect(layout).toContain("hint: tShell('adsAndPerformanceHint')");
    expect(layout).toContain("hint: tShell('funnelAndGoalsHint')");
  });

  it('the ad platform connections link explains itself and promises paused ads', () => {
    const layout = readFileSync(join(__dirname, '../app/[locale]/orgs/[orgId]/projects/[projectId]/layout.tsx'), 'utf8');
    expect(layout).toContain("hint: tShell('connectionsHint')");
    expect(en.AppShell.connectionsHint).toMatch(/paused/i);
    expect(en.AppShell.connectionsHint).not.toMatch(/oauth|api|token|connector/i);
    expect(he.AppShell.connectionsHint).toMatch(/[\u0590-\u05ff]/);
  });

  it('the plain Settings link says what it holds, without jargon', () => {
    const layout = readFileSync(join(__dirname, '../app/[locale]/orgs/[orgId]/projects/[projectId]/layout.tsx'), 'utf8');
    expect(layout).toContain("hint: tShell('settingsHint')");
    expect(en.AppShell.settingsHint.length).toBeGreaterThan(10);
    expect(en.AppShell.settingsHint).not.toMatch(/timezone|locale|environment|api|token/i);
    expect(he.AppShell.settingsHint).toMatch(/[\u0590-\u05ff]/);
  });
});
