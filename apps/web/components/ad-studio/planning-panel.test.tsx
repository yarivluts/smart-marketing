import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import React from 'react';
import type { AdStudioPlan, AdStudioPlanSources } from '@growthos/shared';
import { renderWithIntl } from '@/tests/e2e/helpers/test-harness';
import { PlanningPanel } from './planning-panel';
import { AdStudioAdminPanel } from './ad-studio-admin-panel';
import en from '@/messages/en.json';
import he from '@/messages/he.json';

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
    expect(within(rows[2]).getByText('The project has no ads yet.')).toBeInTheDocument();
    expect(within(rows[3]).getByText('Google Ads is not connected to this project, so the plan uses general market knowledge instead of real search numbers. You can connect it in Ad platform connections - it is optional.')).toBeInTheDocument();
    expect(within(rows[4]).getByText('General knowledge from the AI model. Not measured.')).toBeInTheDocument();
  });

  it('charts the measured results and explains a source without data once, in the sources list', () => {
    renderPanel();
    expect(screen.getByText('Last 90 days. Each sign-up or sale is credited to the last page or ad they came from.')).toBeInTheDocument();
    expect(screen.getByText('example.com/lawyers')).toBeInTheDocument();
    expect(screen.getByText('48 sign-ups or sales · 6% of visitors')).toBeInTheDocument();
    expect(screen.getByText('1,200 visitors · 60 sign-ups or sales · 5% overall')).toBeInTheDocument();
    expect(screen.getByText('cmp-lawyers')).toBeInTheDocument();
    // No empty chart repeats the reason: it is said once, next to the source.
    expect(screen.queryByText(/^Not available:/)).toBeNull();
    expect(screen.getAllByText('Google Ads is not connected to this project, so the plan uses general market knowledge instead of real search numbers. You can connect it in Ad platform connections - it is optional.')).toHaveLength(1);
    expect(within(screen.getByTestId('ad-studio-plan-sources')).getByText('The project has no ads yet.')).toBeInTheDocument();
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
    expect(screen.getByText('High competition · typical cost per click 2.1-9.4')).toBeInTheDocument();
    expect(screen.getByText('not reported')).toBeInTheDocument();
  });

  it('before any analysis it explains the step; with no provider the button is disabled', () => {
    renderPanel({ plan: null, sources: null, generatedBy: null, aiAvailable: false });
    expect(screen.getByText('No analysis yet')).toBeInTheDocument();
    expect(screen.getByText('The AI helper is not switched on yet, so it cannot analyze your ads. Contact GrowthOS support to switch it on.')).toBeInTheDocument();
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
    expect(await screen.findByText("You have used today's AI allowance (50 of 50). It starts again tomorrow, or a project admin can raise it in the studio settings.")).toBeInTheDocument();
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
    expect(screen.getByTestId('ad-studio-keyword-data')).toHaveTextContent('Google Ads is not connected to this project');
    unmount();
    renderWithIntl(<AdStudioAdminPanel {...base} keywordData={{ available: true, credentialName: 'Agency MCC' }} />, { locale: 'en' });
    expect(screen.getByTestId('ad-studio-keyword-data')).toHaveTextContent('Available through Agency MCC');
  });
});

describe('AdStudioAdminPanel AI quality check', () => {
  it('saves the check on or off and its retries together with the limits', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ settings: {} }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    renderWithIntl(
      <AdStudioAdminPanel
        orgId="o"
        projectId="p"
        canConfigure
        textModel={null}
        videoConfigured
        limits={{ dailyTextGenerations: 50, dailyVideoSeconds: 300, dailyImages: 40 }}
        videoQa={{ enabled: true, retries: 1 }}
        usageToday={{ textGenerations: 0, videoSeconds: 0, images: 0 }}
        recentUsage={[]}
        keywordData={{ available: false, reason: 'no_google_ads_credential' }}
      />,
      { locale: 'en' },
    );
    fireEvent.change(screen.getByLabelText('Automatic re-renders per scene or image'), { target: { value: '2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save limits' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(JSON.parse((fetchMock.mock.calls[0] as [string, RequestInit])[1].body as string)).toMatchObject({ videoQa: { enabled: true, retries: 2 } });
    // Turning the check off disables the retries choice.
    fireEvent.click(screen.getByLabelText('Check every clip and image'));
    expect(screen.getByLabelText('Automatic re-renders per scene or image')).toBeDisabled();
    vi.unstubAllGlobals();
  });

  it('explains every missing planning source in plain words, with no vault, credential, brief or token jargon', () => {
    for (const messages of [en, he] as const) {
      const reasons = messages.AdStudio.plan.reasons as Record<string, Record<string, string>>;
      for (const source of ['landing_page', 'keywords']) {
        for (const [reason, text] of Object.entries(reasons[source])) {
          expect(text, `${source}.${reason}`).not.toMatch(/vault|credential|\bbrief\b|\btoken\b|secret|deployment|\u05db\u05e1\u05e4\u05ea|\u05d1\u05e8\u05d9\u05e3|\u05e1\u05d5\u05d3|Developer/i);
        }
      }
    }
  });
});
