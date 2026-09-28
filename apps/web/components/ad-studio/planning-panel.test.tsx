import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import React from 'react';
import type { AdStudioPlan, AdStudioPlanSources } from '@growthos/shared';
import { renderWithIntl } from '@/tests/e2e/helpers/test-harness';
import { PlanningPanel } from './planning-panel';
import { AdStudioAdminPanel } from './ad-studio-admin-panel';

const refresh = vi.fn();
vi.mock('@/i18n/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh }) }));

const SOURCES: AdStudioPlanSources = {
  landingPage: { status: 'ok', url: 'https://example.com/lawyers', title: 'EasySign', description: '', headings: ['Sign in 30 seconds'], truncated: false, textLength: 900 },
  results: {
    status: 'ok',
    environmentName: 'prod',
    since: '2026-06-30',
    days: 90,
    totals: { visitors: 1200, conversions: 60, conversionRate: 0.05 },
    landingPages: [
      { key: 'https://example.com/lawyers', visitors: 800, conversions: 48, conversionRate: 0.06 },
      { key: 'https://example.com/pricing', visitors: 400, conversions: 12, conversionRate: 0.03 },
    ],
    campaigns: [{ key: 'cmp-lawyers', visitors: 700, conversions: 42, conversionRate: 0.06 }],
  },
  campaigns: { status: 'unavailable', reason: 'no_campaigns' },
  keywords: { status: 'unavailable', reason: 'no_google_ads_credential' },
};

const PLAN: AdStudioPlan = {
  summary: 'Lead with the 30-second claim.',
  audience: 'Solo lawyers',
  landingPageSummary: 'Mobile e-signing for law firms.',
  messagingAngles: ['Speed', 'Sign anywhere'],
  keywordThemes: [{ theme: 'E-signature', keywords: ['electronic signature'], evidence: 'From the page headings' }],
  recommendations: [
    { title: 'Add captions', rationale: 'Feeds play muted', priority: 'low', evidence: [{ source: 'market', detail: 'General practice' }] },
    { title: 'Open on the claim', rationale: 'The H1 leads with it', priority: 'high', evidence: [{ source: 'landing_page', detail: 'H1: Sign in 30 seconds' }] },
    { title: 'Push the pricing page', rationale: 'Guess', priority: 'medium', evidence: [], unsupported: true },
  ],
  marketNotes: ['Short-form feeds autoplay muted.'],
};

function renderPanel(props: Partial<React.ComponentProps<typeof PlanningPanel>> = {}) {
  return renderWithIntl(
    <PlanningPanel orgId="o" projectId="p" briefId="b1" plan={PLAN} sources={SOURCES} generatedBy={{ model: 'gemini-3.8-flash', generatedAt: '2026-09-27T12:00:00Z' }} aiAvailable {...props} />,
    { locale: 'en' },
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
  refresh.mockReset();
});

describe('PlanningPanel', () => {
  it('lists every data source with a translated reason for the missing ones and market knowledge as model-only', () => {
    renderPanel();
    const checklist = screen.getByTestId('ad-studio-plan-sources');
    const rows = within(checklist).getAllByRole('listitem');
    expect(rows.map((row) => row.getAttribute('data-status'))).toEqual(['ok', 'ok', 'unavailable', 'unavailable', 'model']);
    expect(within(rows[0]).getByText('Read example.com/lawyers')).toBeInTheDocument();
    expect(within(rows[2]).getByText('The project has no campaigns yet.')).toBeInTheDocument();
    expect(within(rows[3]).getByText('No Google Ads credential is attached to the project.')).toBeInTheDocument();
    expect(within(rows[4]).getByText('General knowledge from the AI model. Not measured.')).toBeInTheDocument();
  });

  it('charts the measured results and says why a chart has no data', () => {
    renderPanel();
    expect(screen.getByText('Last 90 days in the prod environment. Visitors are summed daily landings; conversions are last-touch.')).toBeInTheDocument();
    expect(screen.getByText('example.com/lawyers')).toBeInTheDocument();
    expect(screen.getByText('48 conversions · 6% conversion rate')).toBeInTheDocument();
    expect(screen.getByText('1,200 visitors · 60 conversions · 5% overall')).toBeInTheDocument();
    expect(screen.getByText('cmp-lawyers')).toBeInTheDocument();
    expect(screen.getByText('Not available: No Google Ads credential is attached to the project.')).toBeInTheDocument();
    expect(screen.getByText('Not available: The project has no campaigns yet.')).toBeInTheDocument();
  });

  it('shows recommendations high priority first with the evidence they cite, flags unsupported ones, and labels market notes as not measured', () => {
    renderPanel();
    const cards = screen.getAllByTestId('ad-studio-recommendation');
    expect(cards.map((card) => within(card).getByText(/Open on|Push the|Add captions/).textContent)).toEqual(['Open on the claim', 'Push the pricing page', 'Add captions']);
    expect(within(cards[0]).getByText('High priority')).toBeInTheDocument();
    expect(within(cards[0]).getByText('Landing page')).toBeInTheDocument();
    expect(within(cards[1]).getByText('No available evidence behind this - treat it as a suggestion.')).toBeInTheDocument();
    expect(within(cards[2]).getByText('Market knowledge')).toBeInTheDocument();
    const market = screen.getByTestId('ad-studio-market-notes');
    expect(within(market).getByText('General model knowledge, not measured data. Check it before relying on it.')).toBeInTheDocument();
    expect(screen.getByText('Solo lawyers')).toHaveAttribute('dir', 'auto');
  });

  it('charts keyword ideas by volume with competition chips when Google Ads data is there', () => {
    renderPanel({
      sources: {
        ...SOURCES,
        keywords: {
          status: 'ok',
          seedKeywords: ['e-signature'],
          seedUrl: null,
          language: 'languageConstants/1000',
          geoTargets: [],
          ideas: [
            { keyword: 'electronic signature', avgMonthlySearches: 12100, competition: 'HIGH', lowTopOfPageBid: 2.1, highTopOfPageBid: 9.4 },
            { keyword: 'sign pdf free', avgMonthlySearches: null, competition: null, lowTopOfPageBid: null, highTopOfPageBid: null },
          ],
        },
      },
    });
    expect(within(screen.getByTestId('ad-studio-keyword-competition')).getByText('High competition · 1')).toBeInTheDocument();
    expect(screen.getByText('12,100')).toBeInTheDocument();
    expect(screen.getByText('High competition · top-of-page bid 2.1-9.4')).toBeInTheDocument();
    expect(screen.getByText('not reported')).toBeInTheDocument();
  });

  it('before any analysis it explains the step; with no provider the button is disabled', () => {
    renderPanel({ plan: null, sources: null, generatedBy: null, aiAvailable: false });
    expect(screen.getByText('No analysis yet')).toBeInTheDocument();
    expect(screen.getByText('No AI provider is configured for this deployment, so deep analysis cannot run.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Run deep analysis' })).toBeDisabled();
  });

  it('runs the analysis and refreshes, or shows the translated error', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: 'quota_exceeded', limitKind: 'text', used: 50, limit: 50 }), { status: 429 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ brief: {} }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    renderPanel({ plan: null, sources: null, generatedBy: null });
    fireEvent.click(screen.getByRole('button', { name: 'Run deep analysis' }));
    expect(await screen.findByText("Today's limit is reached (50 of 50). A project admin can raise it in the studio settings.")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith('/api/orgs/o/projects/p/ad-studio/briefs/b1/plan', { method: 'POST' });

    fireEvent.click(screen.getByRole('button', { name: 'Run deep analysis' }));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(screen.getByText('Analysis ready.')).toBeInTheDocument();
  });
});

describe('AdStudioAdminPanel keyword data', () => {
  const base = {
    orgId: 'o',
    projectId: 'p',
    canConfigure: false,
    textModel: null,
    videoConfigured: false,
    limits: { dailyTextGenerations: 50, dailyVideoSeconds: 300, dailyImages: 40 },
    usageToday: { textGenerations: 0, videoSeconds: 0, images: 0 },
    recentUsage: [],
  };

  it('says why keyword volumes are missing, or which credential provides them', () => {
    const { unmount } = renderWithIntl(<AdStudioAdminPanel {...base} keywordData={{ available: false, reason: 'no_google_ads_credential' }} />, { locale: 'en' });
    expect(screen.getByTestId('ad-studio-keyword-data')).toHaveTextContent('No Google Ads credential is attached to this project.');
    unmount();
    renderWithIntl(<AdStudioAdminPanel {...base} keywordData={{ available: true, credentialName: 'Agency MCC' }} />, { locale: 'en' });
    expect(screen.getByTestId('ad-studio-keyword-data')).toHaveTextContent('Available through Agency MCC');
  });
});
