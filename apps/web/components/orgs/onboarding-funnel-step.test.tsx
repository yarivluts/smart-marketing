import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { OnboardingFunnelStep } from './onboarding-funnel-step';
import messages from '../../messages/en.json';

const refresh = vi.fn();

vi.mock('@/i18n/navigation', () => ({
  useRouter: () => ({ refresh }),
}));

const PROPOSAL = [
  { eventSchemaName: 'page_viewed', stageKey: 'awareness' as const },
  { eventSchemaName: 'user_signed_up', stageKey: 'signup' as const },
];

describe('OnboardingFunnelStep', () => {
  beforeEach(() => {
    refresh.mockClear();
    vi.stubGlobal('fetch', vi.fn());
  });

  it('confirms the proposed order as-is', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: true, json: async () => ({ state: { step: 'board' } }) } as Response);
    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <OnboardingFunnelStep orgId="org-1" projectId="project-1" proposal={PROPOSAL} />
      </NextIntlClientProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Confirm funnel' }));

    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(fetch).toHaveBeenCalledWith('/api/orgs/org-1/projects/project-1/onboarding/funnel', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        steps: [
          { eventSchemaName: 'page_viewed', stageKey: 'awareness', order: 0 },
          { eventSchemaName: 'user_signed_up', stageKey: 'signup', order: 1 },
        ],
      }),
    });
  });

  it('excluding a step via its checkbox drops it from the confirmed list', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: true, json: async () => ({ state: { step: 'board' } }) } as Response);
    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <OnboardingFunnelStep orgId="org-1" projectId="project-1" proposal={PROPOSAL} />
      </NextIntlClientProvider>,
    );

    fireEvent.click(screen.getByRole('checkbox', { name: 'page_viewed' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm funnel' }));

    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(
        '/api/orgs/org-1/projects/project-1/onboarding/funnel',
        expect.objectContaining({
          body: JSON.stringify({ steps: [{ eventSchemaName: 'user_signed_up', stageKey: 'signup', order: 0 }] }),
        }),
      ),
    );
  });

  it('moving a step down reorders the confirmed list', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: true, json: async () => ({ state: { step: 'board' } }) } as Response);
    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <OnboardingFunnelStep orgId="org-1" projectId="project-1" proposal={PROPOSAL} />
      </NextIntlClientProvider>,
    );

    // Both rows have their own "Move down" button (the last row's is disabled) — target the first
    // row's (page_viewed) specifically.
    fireEvent.click(screen.getAllByRole('button', { name: 'Move down' })[0]);
    fireEvent.click(screen.getByRole('button', { name: 'Confirm funnel' }));

    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(
        '/api/orgs/org-1/projects/project-1/onboarding/funnel',
        expect.objectContaining({
          body: JSON.stringify({
            steps: [
              { eventSchemaName: 'user_signed_up', stageKey: 'signup', order: 0 },
              { eventSchemaName: 'page_viewed', stageKey: 'awareness', order: 1 },
            ],
          }),
        }),
      ),
    );
  });

  it('recategorizing a step to a different stage via the select confirms with that stage', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: true, json: async () => ({ state: { step: 'board' } }) } as Response);
    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <OnboardingFunnelStep orgId="org-1" projectId="project-1" proposal={[{ eventSchemaName: 'widget_clicked', stageKey: 'other' as const }]} />
      </NextIntlClientProvider>,
    );

    fireEvent.change(screen.getByDisplayValue('Other'), { target: { value: 'activation' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirm funnel' }));

    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(
        '/api/orgs/org-1/projects/project-1/onboarding/funnel',
        expect.objectContaining({
          body: JSON.stringify({ steps: [{ eventSchemaName: 'widget_clicked', stageKey: 'activation', order: 0 }] }),
        }),
      ),
    );
  });

  it('an empty proposal still renders a confirm button for zero steps', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: true, json: async () => ({ state: { step: 'board' } }) } as Response);
    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <OnboardingFunnelStep orgId="org-1" projectId="project-1" proposal={[]} />
      </NextIntlClientProvider>,
    );

    expect(screen.getByText(/hasn't received any events yet/)).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Confirm funnel' }));

    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(
        '/api/orgs/org-1/projects/project-1/onboarding/funnel',
        expect.objectContaining({ body: JSON.stringify({ steps: [] }) }),
      ),
    );
  });
});
