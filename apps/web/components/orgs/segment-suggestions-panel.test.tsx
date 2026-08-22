import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import type { SegmentSuggestion } from '@growthos/shared';
import { SegmentSuggestionsPanel } from './segment-suggestions-panel';
import messages from '../../messages/en.json';

const refresh = vi.fn();

vi.mock('@/i18n/navigation', () => ({
  useRouter: () => ({ refresh }),
}));

const churnSuggestion: SegmentSuggestion = {
  schemaName: 'stripe_subscription',
  field: 'cancel_at_period_end',
  category: 'churn_risk',
  filters: [{ field: 'cancel_at_period_end', op: '=', value: true }],
  confidence: 1,
};

const vipSuggestion: SegmentSuggestion = {
  schemaName: 'customer',
  field: 'is_vip',
  category: 'vip',
  filters: [{ field: 'is_vip', op: '=', value: true }],
  confidence: 1,
};

function renderPanel(suggestions: SegmentSuggestion[]): void {
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <SegmentSuggestionsPanel orgId="org-1" projectId="project-1" suggestions={suggestions} />
    </NextIntlClientProvider>,
  );
}

describe('SegmentSuggestionsPanel', () => {
  beforeEach(() => {
    refresh.mockClear();
    vi.stubGlobal('fetch', vi.fn());
  });

  it('shows the empty state when there are no suggestions', () => {
    renderPanel([]);
    expect(screen.getByText('No high-value list suggestions right now.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Create list' })).not.toBeInTheDocument();
  });

  it('renders one row per suggestion with its category label and source field', () => {
    renderPanel([churnSuggestion, vipSuggestion]);

    expect(screen.getByText('Churn risk')).toBeInTheDocument();
    expect(screen.getByText('Based on stripe_subscription.cancel_at_period_end')).toBeInTheDocument();
    expect(screen.getByText('High-value')).toBeInTheDocument();
    expect(screen.getByText('Based on customer.is_vip')).toBeInTheDocument();
  });

  it('creates a segment from the suggestion and refreshes on accept', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: true } as Response);
    renderPanel([churnSuggestion]);

    fireEvent.click(screen.getByRole('button', { name: 'Create list' }));

    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(fetch).toHaveBeenCalledWith(
      '/api/orgs/org-1/projects/project-1/segments',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          name: 'Churn risk (stripe_subscription.cancel_at_period_end)',
          schemaName: 'stripe_subscription',
          filters: [{ field: 'cancel_at_period_end', op: '=', value: true }],
        }),
      }),
    );
  });

  it('shows an inline error and does not refresh when the request fails', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: false } as Response);
    renderPanel([churnSuggestion]);

    fireEvent.click(screen.getByRole('button', { name: 'Create list' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Could not create this list. Please try again.');
    expect(refresh).not.toHaveBeenCalled();
  });
});
