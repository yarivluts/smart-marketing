import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { CampaignTargetInput } from './campaign-target-input';
import messages from '../../messages/en.json';

const refresh = vi.fn();

vi.mock('@/i18n/navigation', () => ({
  useRouter: () => ({ refresh }),
}));

function renderInput(monthlyBudget: number | null = null): void {
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <CampaignTargetInput orgId="org-1" projectId="project-1" campaignId="summer_search" monthlyBudget={monthlyBudget} />
    </NextIntlClientProvider>,
  );
}

describe('CampaignTargetInput', () => {
  beforeEach(() => {
    refresh.mockClear();
    vi.stubGlobal('fetch', vi.fn());
  });

  it('renders the current target, empty when none is set', () => {
    renderInput();
    expect(screen.getByLabelText('Spend target for summer_search')).toHaveValue(null);

    renderInput(500);
    expect(screen.getAllByLabelText('Spend target for summer_search')[1]).toHaveValue(500);
  });

  it('PATCHes the new budget on blur, then refreshes', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: true } as Response);
    renderInput();

    fireEvent.change(screen.getByLabelText('Spend target for summer_search'), { target: { value: '750' } });
    fireEvent.blur(screen.getByLabelText('Spend target for summer_search'));

    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(fetch).toHaveBeenCalledWith(
      '/api/orgs/org-1/projects/project-1/campaign-ops/targets/summer_search',
      expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ monthlyBudget: 750 }) }),
    );
  });

  it('DELETEs when cleared to empty on blur, rather than PATCHing budget 0', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: true } as Response);
    renderInput(500);

    fireEvent.change(screen.getByLabelText('Spend target for summer_search'), { target: { value: '' } });
    fireEvent.blur(screen.getByLabelText('Spend target for summer_search'));

    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(fetch).toHaveBeenCalledWith('/api/orgs/org-1/projects/project-1/campaign-ops/targets/summer_search', expect.objectContaining({ method: 'DELETE' }));
  });

  it('shows an inline error and never calls fetch for a negative value', async () => {
    renderInput();

    fireEvent.change(screen.getByLabelText('Spend target for summer_search'), { target: { value: '-5' } });
    fireEvent.blur(screen.getByLabelText('Spend target for summer_search'));

    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't update the target. Please try again.");
    expect(fetch).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();
  });

  it('shows an inline error and does not refresh when the request fails', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: false } as Response);
    renderInput();

    fireEvent.change(screen.getByLabelText('Spend target for summer_search'), { target: { value: '100' } });
    fireEvent.blur(screen.getByLabelText('Spend target for summer_search'));

    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't update the target. Please try again.");
    expect(refresh).not.toHaveBeenCalled();
  });
});
