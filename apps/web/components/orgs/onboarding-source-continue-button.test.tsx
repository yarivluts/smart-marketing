import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { OnboardingSourceContinueButton } from './onboarding-source-continue-button';
import messages from '../../messages/en.json';

const refresh = vi.fn();

vi.mock('@/i18n/navigation', () => ({
  useRouter: () => ({ refresh }),
}));

describe('OnboardingSourceContinueButton', () => {
  beforeEach(() => {
    refresh.mockClear();
    vi.stubGlobal('fetch', vi.fn());
  });

  it('POSTs the push_your_own method with no pluginId, and refreshes', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: true, json: async () => ({ state: { step: 'funnel' } }) } as Response);
    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <OnboardingSourceContinueButton orgId="org-1" projectId="project-1" method="push_your_own" hasReceivedData />
      </NextIntlClientProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));

    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(fetch).toHaveBeenCalledWith('/api/orgs/org-1/projects/project-1/onboarding/source', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ method: 'push_your_own' }),
    });
  });

  it('POSTs the plugin method with its pluginId', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: true, json: async () => ({ state: { step: 'funnel' } }) } as Response);
    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <OnboardingSourceContinueButton orgId="org-1" projectId="project-1" method="plugin" pluginId="com.growthos.stripe" hasReceivedData />
      </NextIntlClientProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));

    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith('/api/orgs/org-1/projects/project-1/onboarding/source', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ method: 'plugin', pluginId: 'com.growthos.stripe' }),
      }),
    );
  });

  it('shows an inline error when the request fails', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: false } as Response);
    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <OnboardingSourceContinueButton orgId="org-1" projectId="project-1" method="push_your_own" hasReceivedData />
      </NextIntlClientProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Something went wrong. Please try again.');
    expect(refresh).not.toHaveBeenCalled();
  });
  /**
   * The step is reachable as soon as an ingest.write key exists, but minting a key moves no
   * data. A project could finish the wizard and land on an empty starter board with nothing
   * having said that nothing was ever received. Continuing anyway is legitimate - the snippet
   * may go up later - so this is a label, not a block.
   */
  it('labels the button differently when no event has been received', () => {
    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <OnboardingSourceContinueButton orgId="org-1" projectId="project-1" method="push_your_own" />
      </NextIntlClientProvider>,
    );

    expect(screen.getByRole('button', { name: 'Continue without data' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Continue' })).not.toBeInTheDocument();
  });

  it('still advances the wizard when continuing without data', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: true, json: async () => ({ state: { step: 'funnel' } }) } as Response);
    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <OnboardingSourceContinueButton orgId="org-1" projectId="project-1" method="push_your_own" />
      </NextIntlClientProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Continue without data' }));

    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });
});
