import { describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
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

describe('AutomationSeedTargetForm short code', () => {
  it('lets a newcomer leave the short code empty and sends a generated one', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);
    renderWithIntl(<AutomationSeedTargetForm orgId="o" projectId="p" connections={[]} />);
    expect(screen.getByLabelText(/Short code \(optional/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Label'), { target: { value: 'Spring Sale!' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add ad' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string) as { targetId: string };
    expect(body.targetId).toMatch(/^spring-sale-[a-z0-9]+$/);
    vi.unstubAllGlobals();
  });

  it('keeps a short code the person typed and still requires a label', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);
    renderWithIntl(<AutomationSeedTargetForm orgId="o" projectId="p" connections={[]} />);
    fireEvent.click(screen.getByRole('button', { name: 'Add ad' }));
    expect((await screen.findByRole('alert')).textContent).toBe('Label and environment are required.');
    expect(fetchMock).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText(/Short code/), { target: { value: 'mine' } });
    fireEvent.change(screen.getByLabelText('Label'), { target: { value: 'Ad' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add ad' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect((JSON.parse(fetchMock.mock.calls[0][1].body as string) as { targetId: string }).targetId).toBe('mine');
    vi.unstubAllGlobals();
  });
});

describe('AutomationSeedTargetForm environment box', () => {
  it('explains in plain words that "live" is right for real ads', () => {
    renderWithIntl(<AutomationSeedTargetForm orgId="o" projectId="p" connections={[]} />);
    const box = screen.getByLabelText('Where it runs');
    expect(box).toHaveValue('live');
    expect(box).toHaveAccessibleDescription(/real ads/);
  });
});
