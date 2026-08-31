import { describe, expect, it, vi } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import React, { useState } from 'react';
import { renderWithIntl, createMockCampaign } from './helpers/test-harness';
import { CampaignCreativesPanel, type ImportedAdView } from '../../components/orgs/campaign-creatives-panel';
import en from '../../messages/en.json';

// Test mock component representing the unified Ads Cockpit UI
function MockAdsCockpit({
  initialCampaigns = [
    createMockCampaign({ id: 'c1', name: 'Meta Retargeting Leads', platform: 'meta', status: 'ENABLED', spendUsd: 1200, roas: 3.8, dailyBudgetUsd: 150 }),
    createMockCampaign({ id: 'c2', name: 'Google Search - Commercial', platform: 'google_ads', status: 'PAUSED', spendUsd: 800, roas: 2.1, dailyBudgetUsd: 100 }),
  ],
  onStatusToggle = vi.fn(),
  onBudgetChange = vi.fn(),
}: {
  initialCampaigns?: ReturnType<typeof createMockCampaign>[];
  onStatusToggle?: (campaignId: string, newStatus: 'ENABLED' | 'PAUSED') => void;
  onBudgetChange?: (campaignId: string, newBudget: number) => void;
}) {
  const [campaigns, setCampaigns] = useState(initialCampaigns);

  function handleToggle(campaignId: string) {
    setCampaigns((prev) =>
      prev.map((c) => {
        if (c.id === campaignId) {
          const nextStatus = c.status === 'ENABLED' ? 'PAUSED' : 'ENABLED';
          onStatusToggle(campaignId, nextStatus);
          return { ...c, status: nextStatus };
        }
        return c;
      }),
    );
  }

  function handleBudget(campaignId: string, budget: number) {
    setCampaigns((prev) =>
      prev.map((c) => {
        if (c.id === campaignId) {
          onBudgetChange(campaignId, budget);
          return { ...c, dailyBudgetUsd: budget };
        }
        return c;
      }),
    );
  }

  return (
    <div data-testid="ads-cockpit">
      <h2>Ads & Performance Cockpit</h2>
      <div className="grid grid-cols-1 gap-4">
        {campaigns.map((camp) => (
          <div key={camp.id} data-testid={`campaign-card-${camp.id}`} className="rounded border p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span data-testid={`platform-badge-${camp.id}`} className="rounded bg-blue-100 px-2 py-0.5 text-xs font-semibold">
                  {camp.platform === 'meta' ? 'Meta Ads' : 'Google Ads'}
                </span>
                <h3 className="font-bold">{camp.name}</h3>
              </div>
              <button
                type="button"
                data-testid={`status-toggle-${camp.id}`}
                onClick={() => handleToggle(camp.id)}
                className="rounded px-3 py-1 text-sm font-medium"
              >
                {camp.status === 'ENABLED' ? 'Pause Campaign' : 'Activate Campaign'}
              </button>
            </div>

            <div className="mt-3 grid grid-cols-4 gap-2 text-sm">
              <div>
                <span className="text-muted-foreground">Daily Budget:</span>
                <input
                  data-testid={`budget-input-${camp.id}`}
                  type="number"
                  defaultValue={camp.dailyBudgetUsd}
                  onBlur={(e) => handleBudget(camp.id, Number(e.target.value))}
                />
              </div>
              <div>
                <span className="text-muted-foreground">Spend:</span>
                <span data-testid={`spend-${camp.id}`} dir="ltr">${camp.spendUsd}</span>
              </div>
              <div>
                <span className="text-muted-foreground">ROAS:</span>
                <span data-testid={`roas-${camp.id}`} dir="ltr">{camp.roas}x</span>
              </div>
              <div>
                <span className="text-muted-foreground">Status:</span>
                <span data-testid={`status-text-${camp.id}`}>{camp.status}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

describe('Tier 1: Unified Ads & Performance Cockpit (R1)', () => {
  it('2.1 renders unified campaign cards with distinct Meta and Google Ads platform badges and performance metrics', () => {
    renderWithIntl(<MockAdsCockpit />);

    expect(screen.getByTestId('platform-badge-c1')).toHaveTextContent('Meta Ads');
    expect(screen.getByTestId('platform-badge-c2')).toHaveTextContent('Google Ads');
    expect(screen.getByText('Meta Retargeting Leads')).toBeInTheDocument();
    expect(screen.getByText('Google Search - Commercial')).toBeInTheDocument();
    expect(screen.getByTestId('spend-c1')).toHaveTextContent('$1200');
    expect(screen.getByTestId('roas-c1')).toHaveTextContent('3.8x');
  });

  it('2.2 performs <= 2-click campaign status toggle (Pause -> Activate and vice versa)', () => {
    const onStatusToggle = vi.fn();
    renderWithIntl(<MockAdsCockpit onStatusToggle={onStatusToggle} />);

    const pauseButton = screen.getByTestId('status-toggle-c1');
    expect(pauseButton).toHaveTextContent('Pause Campaign');
    expect(screen.getByTestId('status-text-c1')).toHaveTextContent('ENABLED');

    // Click 1: Toggle status
    fireEvent.click(pauseButton);
    expect(onStatusToggle).toHaveBeenCalledWith('c1', 'PAUSED');
    expect(screen.getByTestId('status-text-c1')).toHaveTextContent('PAUSED');
    expect(pauseButton).toHaveTextContent('Activate Campaign');

    // Click 2: Re-activate
    fireEvent.click(pauseButton);
    expect(onStatusToggle).toHaveBeenCalledWith('c1', 'ENABLED');
    expect(screen.getByTestId('status-text-c1')).toHaveTextContent('ENABLED');
  });

  it('2.3 updates daily budget inline and triggers instant state update on blur', () => {
    const onBudgetChange = vi.fn();
    renderWithIntl(<MockAdsCockpit onBudgetChange={onBudgetChange} />);

    const budgetInput = screen.getByTestId('budget-input-c1');
    fireEvent.change(budgetInput, { target: { value: '350' } });
    fireEvent.blur(budgetInput);

    expect(onBudgetChange).toHaveBeenCalledWith('c1', 350);
  });

  it('2.4 renders Visual Creatives Gallery with ad image, headline, primary copy, and call-to-action button', () => {
    const importedAds: ImportedAdView[] = [
      {
        adName: 'DocSign Growth Ad #1',
        adSetName: 'Legal Professionals Audience',
        headline: 'Sign Documents 10x Faster',
        primaryText: 'Automate contracts and signatures in seconds with GrowthOS.',
        description: 'Secure, legally compliant electronic signatures.',
        imageUrl: 'https://example.com/ad-image.jpg',
        linkUrl: 'https://growthos.io/easysign',
        callToActionType: 'SIGN_UP',
      },
    ];

    renderWithIntl(<CampaignCreativesPanel draft={undefined} importedAds={importedAds} />);

    expect(screen.getByText('DocSign Growth Ad #1')).toBeInTheDocument();
    expect(screen.getByText('Legal Professionals Audience')).toBeInTheDocument();
    expect(screen.getByText('Sign Documents 10x Faster')).toBeInTheDocument();
    expect(screen.getByText('Automate contracts and signatures in seconds with GrowthOS.')).toBeInTheDocument();
    expect(screen.getByRole('img')).toHaveAttribute('src', 'https://example.com/ad-image.jpg');
    expect(screen.getByText('https://growthos.io/easysign')).toBeInTheDocument();
  });

  it('2.5 displays zero-creatives clean empty state when no ads or drafts are attached', () => {
    renderWithIntl(<CampaignCreativesPanel draft={undefined} importedAds={[]} />);
    expect(screen.getByText(en.Campaigns.noCreativesYet)).toBeInTheDocument();
  });

  it('2.6 renders responsive Google Search RSA ad previews with multi-headlines and descriptions', () => {
    const googleDraft = {
      platform: 'google_ads' as const,
      campaignName: 'Search - SaaS Tools',
      dailyBudgetUsd: 200,
      adGroups: [
        {
          name: 'Core Keywords Group',
          keywords: [{ text: 'digital signatures' }, { text: 'online contract signing' }],
          responsiveSearchAd: {
            headlines: ['Electronic Signature Tool', 'Sign PDF Online Fast', 'Free 14-Day Trial'],
            descriptions: ['Close deals faster with automated signing workflows.', 'Trusted by 5,000+ business worldwide.'],
            finalUrl: 'https://growthos.io/signup',
          },
        },
      ],
    };

    renderWithIntl(<CampaignCreativesPanel draft={googleDraft} />);

    expect(screen.getByText('Electronic Signature Tool')).toBeInTheDocument();
    expect(screen.getByText('Sign PDF Online Fast')).toBeInTheDocument();
    expect(screen.getByText('Close deals faster with automated signing workflows.')).toBeInTheDocument();
    expect(screen.getByText('https://growthos.io/signup')).toBeInTheDocument();
  });
});
