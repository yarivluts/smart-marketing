import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { OnboardingPackStep } from './onboarding-pack-step';
import messages from '../../messages/en.json';

const refresh = vi.fn();

vi.mock('@/i18n/navigation', () => ({
  useRouter: () => ({ refresh }),
}));

const PACKS = [
  { packKey: 'saas_marketing' as const, pluginId: 'com.growthos.saas-marketing-metrics' },
  { packKey: 'engagement' as const, pluginId: 'com.growthos.engagement-pack' },
];

function renderStep(): void {
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <OnboardingPackStep orgId="org-1" projectId="project-1" packs={PACKS} />
    </NextIntlClientProvider>,
  );
}

describe('OnboardingPackStep', () => {
  beforeEach(() => {
    refresh.mockClear();
    vi.stubGlobal('fetch', vi.fn());
  });

  it('selecting a built-in pack posts its packKey and refreshes', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: true, json: async () => ({ state: { step: 'sources' } }) } as Response);
    renderStep();

    fireEvent.click(screen.getByRole('button', { name: /SaaS & Marketing Metrics/ }));

    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(fetch).toHaveBeenCalledWith('/api/orgs/org-1/projects/project-1/onboarding/pack', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ packKey: 'saas_marketing' }),
    });
  });

  it('selecting "custom" posts packKey "custom"', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: true, json: async () => ({ state: { step: 'sources' } }) } as Response);
    renderStep();

    fireEvent.click(screen.getByRole('button', { name: /Custom \/ hybrid/ }));

    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(
        '/api/orgs/org-1/projects/project-1/onboarding/pack',
        expect.objectContaining({ body: JSON.stringify({ packKey: 'custom' }) }),
      ),
    );
  });

  it('shows an inline error when selection fails', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: false } as Response);
    renderStep();

    fireEvent.click(screen.getByRole('button', { name: /Engagement Pack/ }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Something went wrong. Please try again.');
    expect(refresh).not.toHaveBeenCalled();
  });
});
