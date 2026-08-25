import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { AutomationProposeAdEditForm } from './automation-propose-ad-edit-form';
import type { AutomationTargetView } from '@/lib/orgs/automation-view';
import messages from '../../messages/en.json';

const refresh = vi.fn();

vi.mock('@/i18n/navigation', () => ({
  useRouter: () => ({ refresh }),
}));

const TARGETS: AutomationTargetView[] = [
  {
    id: 'target-1',
    targetType: 'campaign',
    label: 'Summer Sale',
    dailyBudgetUsd: 0,
    environmentId: 'live',
    adResourceNames: ['customers/999/adGroupAds/1', 'customers/999/adGroupAds/2'],
  },
];

function renderForm(targets: AutomationTargetView[] = TARGETS): void {
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <AutomationProposeAdEditForm orgId="org-1" projectId="project-1" targets={targets} />
    </NextIntlClientProvider>,
  );
}

function lastRequestBody(): unknown {
  const call = vi.mocked(fetch).mock.calls[0];
  return JSON.parse(String((call[1] as RequestInit).body));
}

describe('AutomationProposeAdEditForm', () => {
  beforeEach(() => {
    refresh.mockClear();
    vi.stubGlobal('fetch', vi.fn());
  });

  it('shows the no-targets note when no target has an ad yet', () => {
    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <AutomationProposeAdEditForm orgId="org-1" projectId="project-1" targets={[]} />
      </NextIntlClientProvider>,
    );

    expect(screen.getByText(/create and execute a campaign draft/)).toBeInTheDocument();
  });

  it('submits an ad edit for the selected target and ad', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: true } as Response);
    renderForm();

    expect(screen.getByLabelText('Ad')).toHaveValue('customers/999/adGroupAds/1');
    fireEvent.change(screen.getByLabelText(/^New headlines/), { target: { value: 'New Headline One\nNew Headline Two\nNew Headline Three' } });
    fireEvent.change(screen.getByLabelText(/^New descriptions/), { target: { value: 'New description one.\nNew description two.' } });
    fireEvent.change(screen.getByLabelText('Final URL'), { target: { value: 'https://example.com/new-widgets' } });

    fireEvent.click(screen.getByRole('button', { name: 'Propose ad edit' }));

    await waitFor(() => expect(refresh).toHaveBeenCalled());
    const body = lastRequestBody() as {
      targetId: string;
      previousAdResourceName: string;
      responsiveSearchAd: { headlines: string[]; descriptions: string[]; finalUrl: string };
    };
    expect(body.targetId).toBe('target-1');
    expect(body.previousAdResourceName).toBe('customers/999/adGroupAds/1');
    expect(body.responsiveSearchAd).toEqual({
      headlines: ['New Headline One', 'New Headline Two', 'New Headline Three'],
      descriptions: ['New description one.', 'New description two.'],
      finalUrl: 'https://example.com/new-widgets',
    });
  });

  it('lets the ad selection change independently for the same target', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: true } as Response);
    renderForm();

    fireEvent.change(screen.getByLabelText('Ad'), { target: { value: 'customers/999/adGroupAds/2' } });
    fireEvent.change(screen.getByLabelText(/^New headlines/), { target: { value: 'A\nB\nC' } });
    fireEvent.change(screen.getByLabelText(/^New descriptions/), { target: { value: 'D\nE' } });
    fireEvent.change(screen.getByLabelText('Final URL'), { target: { value: 'https://example.com' } });
    fireEvent.click(screen.getByRole('button', { name: 'Propose ad edit' }));

    await waitFor(() => expect(refresh).toHaveBeenCalled());
    const body = lastRequestBody() as { previousAdResourceName: string };
    expect(body.previousAdResourceName).toBe('customers/999/adGroupAds/2');
  });

  it('shows an inline error and does not submit when headlines/descriptions/final URL are empty', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: true } as Response);
    renderForm();

    fireEvent.click(screen.getByRole('button', { name: 'Propose ad edit' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Enter at least one headline, one description, and a final URL.');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('shows an inline error and does not refresh when the request fails', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: false } as Response);
    renderForm();

    fireEvent.change(screen.getByLabelText(/^New headlines/), { target: { value: 'A\nB\nC' } });
    fireEvent.change(screen.getByLabelText(/^New descriptions/), { target: { value: 'D\nE' } });
    fireEvent.change(screen.getByLabelText('Final URL'), { target: { value: 'https://example.com' } });
    fireEvent.click(screen.getByRole('button', { name: 'Propose ad edit' }));

    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't propose the ad edit. Please try again.");
    expect(refresh).not.toHaveBeenCalled();
  });
});
