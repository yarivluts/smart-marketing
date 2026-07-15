import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { AutomationProposeCampaignDraftForm } from './automation-propose-campaign-draft-form';
import type { AutomationTargetView } from '@/lib/orgs/automation-view';
import messages from '../../messages/en.json';

const refresh = vi.fn();

vi.mock('@/i18n/navigation', () => ({
  useRouter: () => ({ refresh }),
}));

const TARGETS: AutomationTargetView[] = [{ id: 'target-1', targetType: 'campaign', label: 'Summer Sale', dailyBudgetUsd: 0, environmentId: 'live' }];

function renderForm(): void {
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <AutomationProposeCampaignDraftForm orgId="org-1" projectId="project-1" targets={TARGETS} />
    </NextIntlClientProvider>,
  );
}

function lastRequestBody(): unknown {
  const call = vi.mocked(fetch).mock.calls[0];
  return JSON.parse(String((call[1] as RequestInit).body));
}

describe('AutomationProposeCampaignDraftForm', () => {
  beforeEach(() => {
    refresh.mockClear();
    vi.stubGlobal('fetch', vi.fn());
  });

  it('defaults to Google Ads and submits a google_ads discriminated-union draft', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: true } as Response);
    renderForm();

    expect(screen.getByLabelText('Platform')).toHaveValue('google_ads');
    fireEvent.change(screen.getByLabelText('Campaign name'), { target: { value: 'Winning Themes' } });
    fireEvent.change(screen.getByLabelText('Daily budget (USD)'), { target: { value: '25' } });
    fireEvent.change(screen.getByLabelText('Ad group name'), { target: { value: 'Ad Group 1' } });
    fireEvent.change(screen.getByLabelText('Final URL'), { target: { value: 'https://example.com/widgets' } });
    fireEvent.change(screen.getByLabelText(/Headlines/), {
      target: { value: 'Buy Blue Widgets\nBest Widgets Online\nWidgets For Less' },
    });
    fireEvent.change(screen.getByLabelText(/Descriptions/), {
      target: { value: 'Free shipping on all widgets.\nOrder today, ships tomorrow.' },
    });
    fireEvent.change(screen.getByLabelText(/^Keywords/), { target: { value: 'blue widgets' } });

    fireEvent.click(screen.getByRole('button', { name: 'Propose campaign draft' }));

    await waitFor(() => expect(refresh).toHaveBeenCalled());
    const body = lastRequestBody() as { targetId: string; draft: Record<string, unknown> };
    expect(body.targetId).toBe('target-1');
    expect(body.draft).toMatchObject({
      platform: 'google_ads',
      campaignName: 'Winning Themes',
      advertisingChannelType: 'SEARCH',
      dailyBudgetUsd: 25,
    });
    expect((body.draft.adGroups as unknown[]).length).toBe(1);
  });

  it('switches to Meta and submits a meta discriminated-union draft with the right shape', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: true } as Response);
    renderForm();

    fireEvent.change(screen.getByLabelText('Platform'), { target: { value: 'meta' } });
    fireEvent.change(screen.getByLabelText('Campaign name'), { target: { value: 'Summer Sale' } });
    fireEvent.change(screen.getByLabelText('Daily budget (USD)'), { target: { value: '40' } });
    fireEvent.change(screen.getByLabelText('Objective'), { target: { value: 'OUTCOME_LEADS' } });
    fireEvent.change(screen.getByLabelText('Ad set name'), { target: { value: 'Ad Set 1' } });
    fireEvent.change(screen.getByLabelText('Minimum age'), { target: { value: '21' } });
    fireEvent.change(screen.getByLabelText('Maximum age'), { target: { value: '55' } });
    fireEvent.click(screen.getByLabelText('Female'));
    fireEvent.change(screen.getByLabelText(/Countries/), { target: { value: 'US\nCA' } });
    fireEvent.change(screen.getByLabelText('Ad name'), { target: { value: 'Ad 1' } });
    fireEvent.change(screen.getByLabelText('Link URL'), { target: { value: 'https://example.com/widgets' } });
    fireEvent.change(screen.getByLabelText('Primary text'), { target: { value: 'Big summer savings.' } });
    fireEvent.change(screen.getByLabelText('Headline'), { target: { value: 'Blue Widgets Sale' } });

    fireEvent.click(screen.getByRole('button', { name: 'Propose campaign draft' }));

    await waitFor(() => expect(refresh).toHaveBeenCalled());
    const body = lastRequestBody() as { draft: Record<string, unknown> };
    expect(body.draft).toMatchObject({ platform: 'meta', campaignName: 'Summer Sale', objective: 'OUTCOME_LEADS', dailyBudgetUsd: 40 });
    const adSets = body.draft.adSets as Array<Record<string, unknown>>;
    expect(adSets).toHaveLength(1);
    expect(adSets[0]).toMatchObject({ name: 'Ad Set 1' });
    expect(adSets[0].targeting).toMatchObject({ countries: ['US', 'CA'], ageMin: 21, ageMax: 55, genders: ['female'] });
    expect(adSets[0].ad).toMatchObject({
      name: 'Ad 1',
      creative: { primaryText: 'Big summer savings.', headline: 'Blue Widgets Sale', linkUrl: 'https://example.com/widgets' },
    });
  });

  it('shows an inline error for a Meta draft with no countries, without submitting', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: true } as Response);
    renderForm();

    fireEvent.change(screen.getByLabelText('Platform'), { target: { value: 'meta' } });
    fireEvent.change(screen.getByLabelText('Campaign name'), { target: { value: 'Summer Sale' } });
    fireEvent.change(screen.getByLabelText('Daily budget (USD)'), { target: { value: '40' } });

    fireEvent.click(screen.getByRole('button', { name: 'Propose campaign draft' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Enter at least one country code.');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('shows an inline error and does not refresh when the request fails', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: false } as Response);
    renderForm();

    fireEvent.change(screen.getByLabelText('Campaign name'), { target: { value: 'Winning Themes' } });
    fireEvent.change(screen.getByLabelText('Daily budget (USD)'), { target: { value: '25' } });
    fireEvent.change(screen.getByLabelText('Ad group name'), { target: { value: 'Ad Group 1' } });
    fireEvent.change(screen.getByLabelText('Final URL'), { target: { value: 'https://example.com/widgets' } });
    fireEvent.change(screen.getByLabelText(/Headlines/), {
      target: { value: 'Buy Blue Widgets\nBest Widgets Online\nWidgets For Less' },
    });
    fireEvent.change(screen.getByLabelText(/Descriptions/), {
      target: { value: 'Free shipping on all widgets.\nOrder today, ships tomorrow.' },
    });
    fireEvent.change(screen.getByLabelText(/^Keywords/), { target: { value: 'blue widgets' } });

    fireEvent.click(screen.getByRole('button', { name: 'Propose campaign draft' }));

    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't propose the campaign draft. Please try again.");
    expect(refresh).not.toHaveBeenCalled();
  });
});
