import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { SetCostQuotaForm } from './set-cost-quota-form';
import messages from '../../messages/en.json';

const refresh = vi.fn();

vi.mock('@/i18n/navigation', () => ({
  useRouter: () => ({ refresh }),
}));

function renderForm(): void {
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <SetCostQuotaForm orgId="org-1" projectId="project-1" dailyQueryLimit={500} labels={{ team: 'growth' }} />
    </NextIntlClientProvider>,
  );
}

describe('SetCostQuotaForm', () => {
  beforeEach(() => {
    refresh.mockClear();
    vi.stubGlobal('fetch', vi.fn());
  });

  it('submits the parsed limit + labels and refreshes on success', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: true, json: async () => ({}) } as Response);
    renderForm();

    fireEvent.change(screen.getByLabelText('Daily query limit'), { target: { value: '10' } });
    fireEvent.change(screen.getByLabelText('Labels'), { target: { value: 'team=growth\ntier=internal' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save quota' }));

    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(fetch).toHaveBeenCalledWith('/api/orgs/org-1/projects/project-1/cost-guardrails/quota', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dailyQueryLimit: 10, labels: { team: 'growth', tier: 'internal' } }),
    });
  });

  it('rejects a non-positive limit client-side without calling fetch', async () => {
    renderForm();

    fireEvent.change(screen.getByLabelText('Daily query limit'), { target: { value: '0' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save quota' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Daily query limit must be a positive whole number.');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('shows an inline error and does not refresh when the request fails', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: false } as Response);
    renderForm();

    fireEvent.click(screen.getByRole('button', { name: 'Save quota' }));

    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't set the quota. Please try again.");
    expect(refresh).not.toHaveBeenCalled();
  });
});
