import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import React from 'react';
import { renderWithIntl } from '../../tests/e2e/helpers/test-harness';
import { AutomationSeedTargetForm } from './automation-seed-target-form';
import type { AutomationConnectionOption } from '@/lib/orgs/automation-view';

vi.mock('@/i18n/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));

describe('AutomationSeedTargetForm connection picker', () => {
  it('names a connection with its write tier, and one without a tier by its label alone', () => {
    renderWithIntl(
      <AutomationSeedTargetForm
        orgId="o"
        projectId="p"
        connections={[
          { id: 'a', label: 'Meta prod', tier: 'manage' },
          // A legacy attachment that predates write tiers: rendering it must not throw.
          { id: 'b', label: 'Legacy Google', tier: undefined as unknown as AutomationConnectionOption['tier'] },
        ]}
      />,
    );
    const options = screen.getAllByRole('option').map((option) => option.textContent);
    expect(options).toContain('Legacy Google');
    expect(options.some((text) => text?.startsWith('Meta prod') && text !== 'Meta prod')).toBe(true);
  });

  it('describes each access level in plain words instead of Read / Optimize / Manage', () => {
    renderWithIntl(
      <AutomationSeedTargetForm
        orgId="o"
        projectId="p"
        connections={[
          { id: 'a', label: 'A', tier: 'read' },
          { id: 'b', label: 'B', tier: 'optimize' },
          { id: 'c', label: 'C', tier: 'manage' },
        ]}
      />,
    );
    const options = screen.getAllByRole('option').map((option) => option.textContent);
    expect(options).toContain('A (Look only - changes nothing)');
    expect(options).toContain('B (Adjust budgets, pause or turn on ads)');
    expect(options).toContain('C (Full control - also create and edit ads)');
  });
});
