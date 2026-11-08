import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import React from 'react';
import { renderWithIntl } from '@/tests/e2e/helpers/test-harness';
import en from '@/messages/en.json';
import heMessages from '@/messages/he.json';
import type { GrowthPilotPageData } from '@/lib/growth-pilot/view';
import { liveTarget, pageData, proposalView, targetView } from '@/lib/growth-pilot/test-fixtures';
import { GrowthTargetDetail } from './target-detail';

vi.mock('@/i18n/navigation', () => ({
  Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

const BASE = '/api/orgs/o/projects/p/growth-pilot';
const words = en.GrowthPilot.detail;
const NOW = new Date('2026-11-10T12:00:00.000Z');
const CONTENT = { eyebrow: 'For offices', headline: 'Sign fast', subheadline: 'On WhatsApp', benefits: [], steps: [], faq: [], ctaText: 'Start', closingHeadline: 'Ready?' };
const PAGE = { id: 'lp1', targetId: 't1', slug: 'abcDEF123456', status: 'published' as const, content: CONTENT, dir: 'ltr' as const, ctaUrl: 'https://a.co/', publishedOn: '2026-11-03T10:00:00.000Z' };

/** Answers each request by its address: the performance numbers, and the page data for any POST. */
function stubServer(answers: { performance?: unknown; post?: { status?: number; body: unknown } } = {}) {
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (url.startsWith(`${BASE}/performance`)) return new Response(JSON.stringify(answers.performance ?? { status: 'none' }));
    if (init?.method === 'POST' && answers.post) return new Response(JSON.stringify(answers.post.body), { status: answers.post.status ?? 200 });
    return new Response('{}', { status: 500 });
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

const posts = (fetchMock: ReturnType<typeof vi.fn>) =>
  fetchMock.mock.calls.filter(([, init]) => (init as RequestInit | undefined)?.method === 'POST').map(([url, init]) => ({ url: url as string, body: JSON.parse((init as RequestInit).body as string) }));

function render(data: GrowthPilotPageData, props: Partial<React.ComponentProps<typeof GrowthTargetDetail>> = {}) {
  return renderWithIntl(<GrowthTargetDetail orgId="o" projectId="p" targetId="t1" initial={data} now={NOW} {...props} />, { locale: 'en' });
}

beforeEach(() => {
  try {
    window.localStorage.clear();
  } catch {
    // Not available: nothing to clear.
  }
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('GrowthTargetDetail', () => {
  it('shows how far a live item got, every step, what is done with links to each piece, and its results', async () => {
    const results = { spend: 42.5, impressions: 1200, clicks: 30, linkClicks: 25, conversions: 2, ctr: 0.025, cpc: 1.4, costPerConversion: 21 };
    stubServer({ performance: { status: 'ok', since: '', until: '', summary: { totals: results, daily: [], byTarget: { t1: results } } } });
    const proposals = [proposalView({ kind: 'target', status: 'approved', decidedOn: '2026-11-01T11:00:00.000Z' }), proposalView({ id: 'on', kind: 'activate', status: 'approved', decidedOn: '2026-11-05T11:00:00.000Z' })];
    render(pageData({ targets: [liveTarget()], proposals, landingPages: [PAGE] }));

    expect(screen.getByRole('heading', { level: 1, name: 'Digital signature' })).toBeInTheDocument();
    const stages = screen.getAllByTestId('growth-pilot-stage');
    expect(stages.map((stage) => [stage.getAttribute('data-stage'), stage.getAttribute('data-state')])).toEqual([
      ['idea', 'done'],
      ['audience', 'done'],
      ['landing', 'done'],
      ['images', 'done'],
      ['video', 'skipped'],
      ['published', 'done'],
      ['live', 'done'],
      ['results', 'in_progress'],
    ]);
    // Once Meta's numbers arrive, collecting results counts as done too.
    await waitFor(() => expect(screen.getByTestId('growth-pilot-detail-percent')).toHaveTextContent('100%'));
    const resultsCard = screen.getByTestId('growth-pilot-detail-results');
    expect(within(resultsCard).getByText('30')).toBeInTheDocument();

    const done = screen.getByTestId('growth-pilot-detail-done');
    const links = within(done).getAllByTestId('growth-pilot-done-link');
    expect(links.map((link) => link.getAttribute('href'))).toEqual(expect.arrayContaining(['/lp/abcDEF123456', '/orgs/o/projects/p/ad-studio?brief=b1&step=review', '/orgs/o/projects/p/ad-studio?brief=b1&step=publish']));
    expect(screen.getByTestId('growth-pilot-detail-back')).toHaveAttribute('href', '/orgs/o/projects/p/growth-pilot');
  });

  it('names the publish step in plain words: sent to Facebook and Instagram, still off', () => {
    expect(en.GrowthPilot.detail.stages.published).toBe('Ads sent to Facebook & Instagram (still off)');
    expect(en.GrowthPilot.detail.done.published).toBe(en.GrowthPilot.detail.stages.published);
    expect(heMessages.GrowthPilot.detail.done.published).toBe(heMessages.GrowthPilot.detail.stages.published);
    expect(heMessages.GrowthPilot.detail.stages.published).not.toBe(en.GrowthPilot.detail.stages.published);
  });

  it('puts what waits for the person on the page with the same buttons, and points at it as the next step', async () => {
    const fetchMock = stubServer({ post: { body: pageData({ targets: [targetView({ adsStatus: 'approved', landingStatus: 'ready', audienceStatus: 'ready' })] }) } });
    const ads = proposalView({ id: 'ads1', kind: 'ads', briefId: 'b1', previewImageIds: ['i1'] });
    render(pageData({ targets: [targetView({ adsStatus: 'ready', landingStatus: 'ready', audienceStatus: 'ready' })], proposals: [ads, proposalView({ id: 'other', kind: 'ads', targetId: 't2' })] }));

    const waiting = screen.getByTestId('growth-pilot-detail-waiting');
    expect(within(waiting).getAllByTestId('growth-pilot-proposal')).toHaveLength(1);
    expect(screen.getByTestId('growth-pilot-next')).toHaveAttribute('data-next', 'ads');
    expect(screen.getByTestId('growth-pilot-next-go')).toHaveAttribute('href', '#proposal-ads1');
    expect(screen.getByTestId('growth-pilot-stepper').querySelector('[data-stage="images"]')).toHaveAttribute('data-state', 'waiting');

    fireEvent.click(within(waiting).getByTestId('growth-pilot-approve'));
    await waitFor(() => expect(posts(fetchMock)).toEqual([{ url: `${BASE}/proposals/ads1`, body: { action: 'approve' } }]));
  });

  it('sends a change request in the person own words for the part they pick, and says it was sent', async () => {
    // Publishing was declined, so the pilot has nothing to do by itself (the page does not keep polling).
    const target = liveTarget({ publishStatus: 'rejected', liveAds: 0 });
    const after = pageData({ targets: [{ ...target, changeRequests: [{ area: 'landing', text: 'A shorter headline', on: '2026-11-10T12:00:00.000Z', outcome: 'done', failureCode: null }] }] });
    const fetchMock = stubServer({ post: { body: after } });
    render(pageData({ targets: [target], landingPages: [PAGE] }));

    const form = screen.getByTestId('growth-pilot-detail-change');
    expect(within(form).getByTestId('growth-pilot-change-area-ads')).toBeChecked();
    fireEvent.click(within(form).getByTestId('growth-pilot-change-area-landing'));
    expect(within(form).getByText(en.GrowthPilot.detail.change.areaHint.landing)).toBeInTheDocument();
    const send = within(form).getByTestId('growth-pilot-detail-change-send');
    expect(send).toBeDisabled();
    fireEvent.change(within(form).getByTestId('growth-pilot-detail-change-input'), { target: { value: 'A shorter headline' } });
    fireEvent.click(send);

    await waitFor(() => expect(screen.getByTestId('growth-pilot-detail-change-sent')).toBeInTheDocument());
    expect(posts(fetchMock)).toEqual([{ url: `${BASE}/targets/t1`, body: { action: 'change', area: 'landing', request: 'A shorter headline' } }]);
    expect(within(form).getByTestId('growth-pilot-detail-change-input')).toHaveValue('');
    expect(within(screen.getByTestId('growth-pilot-detail-change-history')).getByText('A shorter headline')).toBeInTheDocument();
  });

  it('shows why a change could not be sent, and keeps what the person wrote', async () => {
    stubServer({ post: { status: 409, body: { error: 'not_changeable', area: 'ads' } } });
    render(pageData({ targets: [liveTarget({ publishStatus: 'rejected' })] }));
    fireEvent.change(screen.getByTestId('growth-pilot-detail-change-input'), { target: { value: 'Brighter' } });
    fireEvent.click(screen.getByTestId('growth-pilot-detail-change-send'));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(en.GrowthPilot.errors.not_changeable));
    expect(screen.getByTestId('growth-pilot-detail-change-input')).toHaveValue('Brighter');
  });

  it('suggests changes from the results; Do it sends the matching change, Not now hides it', async () => {
    const results = { spend: 30, impressions: 900, clicks: 0, linkClicks: 0, conversions: 0, ctr: 0, cpc: null, costPerConversion: null };
    const proposals = [proposalView({ id: 'on', kind: 'activate', status: 'approved', decidedOn: '2026-11-05T11:00:00.000Z' })];
    // After the request the server has the ads change under way, so the suggestion is done.
    const asked = liveTarget({ changeRequests: [{ area: 'ads', text: words.suggestions.no_clicks.request, on: '2026-11-10T12:00:00.000Z', outcome: 'pending', failureCode: null }] });
    const performance = { status: 'ok', since: '', until: '', summary: { totals: results, daily: [], byTarget: { t1: results } } };
    const fetchMock = stubServer({ performance, post: { body: pageData({ targets: [asked], proposals, landingPages: [PAGE] }) } });
    const { unmount } = render(pageData({ targets: [liveTarget()], proposals, landingPages: [PAGE] }));

    const suggestion = await screen.findByTestId('growth-pilot-suggestion');
    expect(suggestion).toHaveAttribute('data-suggestion', 'no_clicks');
    fireEvent.click(within(suggestion).getByTestId('growth-pilot-suggestion-apply'));
    await waitFor(() => expect(posts(fetchMock)).toEqual([{ url: `${BASE}/targets/t1`, body: { action: 'change', area: 'ads', request: words.suggestions.no_clicks.request } }]));
    await waitFor(() => expect(screen.queryByTestId('growth-pilot-suggestion')).not.toBeInTheDocument());
    expect(within(screen.getByTestId('growth-pilot-detail-in-progress')).getByText(/Nobody clicks/)).toBeInTheDocument();
    unmount();

    // Not now hides it, and it stays hidden on this browser next time.
    render(pageData({ targets: [liveTarget()], proposals, landingPages: [PAGE] }));
    fireEvent.click(within(await screen.findByTestId('growth-pilot-suggestion')).getByTestId('growth-pilot-suggestion-dismiss'));
    expect(screen.queryByTestId('growth-pilot-suggestion')).not.toBeInTheDocument();
    expect(JSON.parse(window.localStorage.getItem('growthos.pilot.dismissedSuggestions') ?? '{}')).toEqual({ t1: ['no_clicks'] });
  });

  it('offers a video when one can be made, and makes it on request', async () => {
    const fetchMock = stubServer({ post: { body: pageData({ targets: [targetView({ adsStatus: 'approved', landingStatus: 'ready', audienceStatus: 'ready', videoStatus: 'building' })] }) } });
    render(pageData({ targets: [targetView({ adsStatus: 'approved', landingStatus: 'ready', audienceStatus: 'ready' })] }), { videoAvailable: true });
    const suggestion = screen.getByTestId('growth-pilot-suggestion');
    expect(suggestion).toHaveAttribute('data-suggestion', 'add_video');
    // Not offered twice: the suggestion covers it.
    expect(screen.queryByTestId('growth-pilot-detail-more')?.querySelector('[data-action="makeVideo"]') ?? null).toBeNull();
    fireEvent.click(within(suggestion).getByTestId('growth-pilot-suggestion-apply'));
    await waitFor(() => expect(posts(fetchMock)[0]).toEqual({ url: `${BASE}/targets/t1`, body: { action: 'video' } }));
  });

  it('lists only what is actually possible under What else can be done', () => {
    stubServer();
    const proposals = [proposalView({ id: 'pub', kind: 'publish', publish: { destination: 'meta', imageIds: ['i1'], dailyBudget: 20, linkUrl: 'https://a.co/', campaignName: 'x', countries: ['IL'] } })];
    const target = liveTarget({ publishStatus: 'ready', liveAds: 0 });
    const { unmount } = render(pageData({ targets: [target], proposals, landingPages: [PAGE] }));
    const actions = () => within(screen.getByTestId('growth-pilot-detail-more')).getAllByTestId('growth-pilot-action').map((item) => item.getAttribute('data-action'));
    expect(actions()).toEqual(['publish', 'askChange', 'viewPage', 'openStudio']);
    unmount();

    // Without automation.execute the publish decision is not theirs to make.
    render(pageData({ targets: [target], proposals, landingPages: [PAGE] }), { canExecute: false });
    expect(actions()).toEqual(['askChange', 'viewPage', 'openStudio']);
    expect(screen.getByTestId('growth-pilot-needs-owner')).toBeInTheDocument();
  });

  it('read-only: everything is visible, but there are no buttons to decide or ask for changes', () => {
    stubServer();
    const ads = proposalView({ id: 'ads1', kind: 'ads', briefId: 'b1' });
    render(pageData({ targets: [targetView({ adsStatus: 'ready', landingStatus: 'failed', audienceStatus: 'ready' })], proposals: [ads] }), { canAct: false });
    expect(screen.getByTestId('growth-pilot-proposal')).toBeInTheDocument();
    expect(screen.queryByTestId('growth-pilot-approve')).not.toBeInTheDocument();
    expect(screen.queryByTestId('growth-pilot-reject')).not.toBeInTheDocument();
    expect(screen.getByTestId('growth-pilot-read-only')).toBeInTheDocument();
    expect(screen.queryByTestId('growth-pilot-detail-change')).not.toBeInTheDocument();
    expect(screen.getByTestId('growth-pilot-detail-read-only')).toBeInTheDocument();
    expect(screen.queryByTestId('growth-pilot-suggestion')).not.toBeInTheDocument();
    expect(screen.getByTestId('growth-pilot-stepper').querySelector('[data-stage="landing"]')).toHaveAttribute('data-state', 'failed');
  });

  it('lists only this item activity, and what the pilot is doing now in plain words', () => {
    stubServer();
    const activity = [
      { id: 'a1', kind: 'ads_ready' as const, byPilot: true, subject: 'Digital signature', count: 4, targetId: 't1', detail: null, on: '2026-11-02T10:00:00.000Z' },
      { id: 'a2', kind: 'ads_ready' as const, byPilot: true, subject: 'Law firms', count: 2, targetId: 't2', detail: null, on: '2026-11-02T11:00:00.000Z' },
      { id: 'a3', kind: 'pilot_paused' as const, byPilot: false, subject: null, count: null, targetId: null, detail: null, on: '2026-11-02T12:00:00.000Z' },
    ];
    const target = targetView({ adsStatus: 'approved', landingStatus: 'ready', audienceStatus: 'approved', changeRequests: [{ area: 'ads', text: 'Brighter', on: '2026-11-03T10:00:00.000Z', outcome: 'pending', failureCode: null }] });
    render(pageData({ targets: [target], activity, proposals: [proposalView({ id: 'lp', kind: 'landing_page', status: 'revising' })] }));
    const feed = screen.getByTestId('growth-pilot-activity');
    expect(within(feed).getAllByRole('listitem')).toHaveLength(1);
    const now = screen.getByTestId('growth-pilot-detail-in-progress');
    expect(within(now).getByText(words.inProgress.landing)).toBeInTheDocument();
    expect(within(now).getByText(/Brighter/)).toBeInTheDocument();
  });

  it('says so when the item is not part of the pilot any more', () => {
    stubServer();
    render(pageData({ targets: [targetView({ id: 'other' })] }));
    expect(screen.getByTestId('growth-pilot-detail-missing')).toBeInTheDocument();
  });

  it('reads right to left in Hebrew', () => {
    stubServer();
    renderWithIntl(<GrowthTargetDetail orgId="o" projectId="p" targetId="t1" initial={pageData({ targets: [liveTarget()] })} now={NOW} />, { locale: 'he' });
    expect(screen.getByText(/חזרה לטייס הצמיחה/)).toBeInTheDocument();
  });
});

describe('GrowthTargetDetail live ads', () => {
  const budgetWords = en.GrowthPilot.detail.budget;
  const ADS_MANAGER = 'https://adsmanager.facebook.com/adsmanager/manage/ads?act=99&selected_campaign_ids=2385';
  const TURNED_ON = proposalView({ id: 'on', kind: 'activate', status: 'approved', decidedOn: '2026-11-05T11:00:00.000Z' });

  it('shows the daily budget with its currency, and changes it only after the person confirms the amount and currency', async () => {
    const fetchMock = stubServer({ post: { body: pageData({ targets: [liveTarget({ dailyBudget: 45, budgetCurrency: 'USD' })] }) } });
    render(pageData({ targets: [liveTarget({ dailyBudget: 20, budgetCurrency: 'USD' })], proposals: [TURNED_ON] }));
    const card = screen.getByTestId('growth-pilot-detail-budget');
    expect(within(card).getByTestId('growth-pilot-budget-current')).toHaveTextContent('$20.00 a day');

    fireEvent.click(within(card).getByTestId('growth-pilot-budget-change'));
    const input = within(card).getByTestId('growth-pilot-budget-input');
    expect(input).toHaveValue(20);
    // Out of range: refused before anything is sent.
    fireEvent.change(input, { target: { value: '0.5' } });
    expect(within(card).getByTestId('growth-pilot-budget-review')).toBeDisabled();
    expect(within(card).getByText(budgetWords.invalid.replace('{min}', '1').replace('{max}', '100000'))).toBeInTheDocument();
    fireEvent.change(input, { target: { value: '45' } });
    fireEvent.click(within(card).getByTestId('growth-pilot-budget-review'));

    const confirm = within(card).getByTestId('growth-pilot-budget-confirm');
    expect(confirm).toHaveTextContent('Set the daily budget to $45.00?');
    expect(confirm).toHaveTextContent('in USD every day');
    expect(posts(fetchMock)).toEqual([]);
    fireEvent.click(within(confirm).getByTestId('growth-pilot-budget-confirm-yes'));
    await waitFor(() => expect(posts(fetchMock)).toEqual([{ url: `${BASE}/targets/t1`, body: { action: 'budget', dailyBudget: 45 } }]));
    await waitFor(() => expect(within(card).getByTestId('growth-pilot-budget-current')).toHaveTextContent('$45.00 a day'));
  });

  it('can step back from the confirmation without sending anything', () => {
    const fetchMock = stubServer();
    render(pageData({ targets: [liveTarget({ dailyBudget: 20, budgetCurrency: null })], proposals: [TURNED_ON] }));
    const card = screen.getByTestId('growth-pilot-detail-budget');
    expect(card).toHaveTextContent(budgetWords.accountCurrency);
    fireEvent.click(within(card).getByTestId('growth-pilot-budget-change'));
    fireEvent.change(within(card).getByTestId('growth-pilot-budget-input'), { target: { value: '30' } });
    fireEvent.click(within(card).getByTestId('growth-pilot-budget-review'));
    expect(within(card).getByTestId('growth-pilot-budget-confirm')).toHaveTextContent(budgetWords.confirmBodyNoCurrency);
    // A newcomer does not know "Meta": the confirmation names the apps they use.
    expect(budgetWords.confirmBodyNoCurrency).not.toMatch(/\bMeta\b/);
    expect(budgetWords.confirmBody).not.toMatch(/\bMeta\b/);
    fireEvent.click(within(card).getByTestId('growth-pilot-budget-confirm-back'));
    fireEvent.click(within(card).getByTestId('growth-pilot-budget-cancel'));
    expect(within(card).getByTestId('growth-pilot-budget-change')).toBeInTheDocument();
    expect(posts(fetchMock)).toEqual([]);
  });

  it('shows the budget but no change to someone who may not publish, and no budget before the ads are on Meta', () => {
    stubServer();
    const { unmount } = render(pageData({ targets: [liveTarget({ dailyBudget: 20, budgetCurrency: 'ILS' })], proposals: [TURNED_ON] }), { canExecute: false });
    const card = screen.getByTestId('growth-pilot-detail-budget');
    expect(within(card).getByTestId('growth-pilot-budget-needs-owner')).toBeInTheDocument();
    expect(within(card).queryByTestId('growth-pilot-budget-change')).toBeNull();
    unmount();
    render(pageData({ targets: [targetView({ adsStatus: 'approved' })] }));
    expect(screen.queryByTestId('growth-pilot-detail-budget')).toBeNull();
  });

  it('falls back to the budget approved at publishing for ads published before the target kept it', () => {
    stubServer();
    const published = proposalView({ id: 'pub', kind: 'publish', status: 'approved', publish: { destination: 'meta', imageIds: [], dailyBudget: 25, linkUrl: 'https://a.co', campaignName: 'C', countries: ['IL'] } });
    render(pageData({ targets: [liveTarget()], proposals: [published, TURNED_ON] }));
    expect(screen.getByTestId('growth-pilot-budget-current')).toHaveTextContent('25 a day');
  });

  it('links to Meta Ads Manager from the done list and the actions once the ads are on Meta', () => {
    stubServer();
    render(pageData({ targets: [liveTarget({ adsManagerUrl: ADS_MANAGER })], proposals: [TURNED_ON] }));
    const links = within(screen.getByTestId('growth-pilot-detail-done')).getAllByTestId('growth-pilot-done-ads-manager');
    expect(links).toHaveLength(2);
    for (const link of links) {
      expect(link).toHaveAttribute('href', ADS_MANAGER);
      expect(link).toHaveAttribute('target', '_blank');
      expect(link).toHaveTextContent(words.adsManagerLink);
    }
    const action = screen.getAllByTestId('growth-pilot-action').find((item) => item.getAttribute('data-action') === 'adsManager');
    expect(action?.querySelector('a')).toHaveAttribute('href', ADS_MANAGER);
  });

  it('suggests more budget when results are good and the budget is spent; applying opens the change, prefilled, without sending it', async () => {
    const results = { spend: 95, impressions: 5000, clicks: 100, linkClicks: 90, conversions: 4, ctr: 0.02, cpc: 0.95, costPerConversion: 23.75 };
    const fetchMock = stubServer({ performance: { status: 'ok', since: '', until: '', summary: { totals: results, daily: [], byTarget: { t1: results } } } });
    render(pageData({ targets: [liveTarget({ dailyBudget: 20, budgetCurrency: 'USD' })], proposals: [TURNED_ON] }));
    const suggestion = await screen.findByText(words.suggestions.raise_budget.title);
    const item = suggestion.closest('[data-testid="growth-pilot-suggestion"]') as HTMLElement;
    fireEvent.click(within(item).getByTestId('growth-pilot-suggestion-apply'));
    expect(screen.getByTestId('growth-pilot-budget-input')).toHaveValue(30);
    expect(posts(fetchMock)).toEqual([]);
  });

  it('does not suggest more budget by a stricter project threshold, nor to someone who may not publish', async () => {
    const results = { spend: 95, impressions: 5000, clicks: 100, linkClicks: 90, conversions: 4, ctr: 0.02, cpc: 0.95, costPerConversion: 23.75 };
    stubServer({ performance: { status: 'ok', since: '', until: '', summary: { totals: results, daily: [], byTarget: { t1: results } } } });
    const strict = { ...(await import('@growthos/shared')).DEFAULT_GROWTH_SUGGESTION_THRESHOLDS, raiseBudgetMinConversions: 10 };
    const { unmount } = render(pageData({ targets: [liveTarget({ dailyBudget: 20 })], proposals: [TURNED_ON] }), { thresholds: strict });
    await waitFor(() => expect(screen.getByTestId('growth-pilot-detail-results')).toBeInTheDocument());
    expect(screen.queryByText(words.suggestions.raise_budget.title)).toBeNull();
    unmount();
    render(pageData({ targets: [liveTarget({ dailyBudget: 20 })], proposals: [TURNED_ON] }), { canExecute: false });
    await waitFor(() => expect(screen.getByTestId('growth-pilot-detail-results')).toBeInTheDocument());
    expect(screen.queryByText(words.suggestions.raise_budget.title)).toBeNull();
  });

  it('a new audience for live ads says it changes the live ad set, and needs the publish permission to apply', async () => {
    const audience = { summary: 'Older offices', targeting: { countries: ['IL'], ageMin: 40, ageMax: 65, genders: [], customAudiences: [], interests: [] }, unresolvedInterests: [], reach: null, meta: 'ok' };
    const live = proposalView({ id: 'aud', kind: 'audience', audience, appliesToLive: true, draft: { kind: 'service', name: 'Digital signature', description: '', audience: '', reason: '' } });
    const fetchMock = stubServer({ post: { body: pageData({ targets: [liveTarget()], proposals: [] }) } });
    const { unmount } = render(pageData({ targets: [liveTarget({ audienceStatus: 'ready' })], proposals: [TURNED_ON, live] }));
    const card = screen.getAllByTestId('growth-pilot-proposal').find((item) => item.id === 'proposal-aud') as HTMLElement;
    expect(within(card).getByTestId('growth-pilot-live-audience')).toHaveTextContent(en.GrowthPilot.audience.liveExplain);
    fireEvent.click(within(card).getByTestId('growth-pilot-approve'));
    await waitFor(() => expect(posts(fetchMock)).toEqual([{ url: `${BASE}/proposals/aud`, body: { action: 'approve' } }]));
    unmount();

    render(pageData({ targets: [liveTarget({ audienceStatus: 'ready' })], proposals: [TURNED_ON, live] }), { canExecute: false });
    const readOnly = screen.getAllByTestId('growth-pilot-proposal').find((item) => item.id === 'proposal-aud') as HTMLElement;
    expect(within(readOnly).queryByTestId('growth-pilot-approve')).toBeNull();
    expect(within(readOnly).getByTestId('growth-pilot-needs-owner')).toBeInTheDocument();
  });

  it('offers the audience as a change for live ads, and links admins to the suggestion settings', () => {
    stubServer();
    render(pageData({ targets: [liveTarget({ adsManagerUrl: ADS_MANAGER })], proposals: [TURNED_ON] }), { settingsHref: '/orgs/o/projects/p/growth-pilot/settings' });
    expect(screen.getByTestId('growth-pilot-change-area-audience')).toBeInTheDocument();
    const action = screen.getAllByTestId('growth-pilot-action').find((item) => item.getAttribute('data-action') === 'thresholds');
    expect(action?.querySelector('a')).toHaveAttribute('href', '/orgs/o/projects/p/growth-pilot/settings');
  });

  it('words budget and audience changes in the feed, with the amount and currency', () => {
    stubServer();
    const activity = [
      { id: 'b1', kind: 'budget_changed' as const, byPilot: false, subject: 'Digital signature', count: 45, targetId: 't1', detail: 'USD', on: '2026-11-06T10:00:00.000Z' },
      { id: 'b2', kind: 'audience_applied' as const, byPilot: false, subject: 'Digital signature', count: null, targetId: 't1', detail: 'updated', on: '2026-11-06T11:00:00.000Z' },
    ];
    render(pageData({ targets: [liveTarget()], proposals: [TURNED_ON], activity }));
    const feed = screen.getByTestId('growth-pilot-activity');
    expect(feed).toHaveTextContent('You set the daily budget for Digital signature to $45.00');
    expect(feed).toHaveTextContent('You changed who the live ads for Digital signature reach');
  });
});
