import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import React from 'react';
import { renderWithIntl } from '@/tests/e2e/helpers/test-harness';
import heMessages from '@/messages/he.json';
import type { GrowthActivityView, GrowthPilotPageData, GrowthProposalView } from '@/lib/growth-pilot/view';
import { isolate } from '@/lib/bidi';
import { GrowthPilotApp } from './growth-pilot-app';

vi.mock('@/i18n/navigation', () => ({
  Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

const BASE = '/api/orgs/o/projects/p/growth-pilot';

const PROPOSAL: GrowthProposalView = {
  id: 'pr1',
  kind: 'target',
  briefId: null,
  landingPageId: null,
  audience: null,
  publish: null,
  previewImageIds: [],
  targetId: 't1',
  status: 'pending',
  draft: { kind: 'service', name: 'Digital signature', description: 'Sign in 30 seconds', audience: 'Small law firms', reason: 'The main service' },
  changes: [],
  createdOn: '2026-10-13T10:00:00Z',
};

function page(extra: Partial<GrowthPilotPageData> & { status?: GrowthPilotPageData['pilot']['status']; failureCode?: string | null } = {}): GrowthPilotPageData {
  return {
    pilot: {
      id: 'g1',
      siteUrl: 'https://easysign.co.il/',
      status: extra.status ?? 'active',
      failureCode: extra.failureCode ?? null,
      analysis: { businessName: 'EasySign', summary: 'Signatures on WhatsApp.', language: 'en', offerings: [], audiences: [] },
      pagesRead: [{ url: 'https://easysign.co.il/', title: 'EasySign' }],
      createdOn: '2026-10-13T10:00:00Z',
    },
    targets: extra.targets ?? [{ id: 't1', kind: 'service', name: 'Digital signature', description: 'Sign in 30 seconds', audience: 'Small law firms', status: 'proposed', origin: 'site', briefId: null, adsStatus: 'none', adsFailure: null, landingPageId: null, landingStatus: 'published' as const, landingFailure: null, audienceStatus: 'approved' as const, audienceFailure: null, publishStatus: 'none' as const, publishFailure: null }],
    proposals: extra.proposals ?? [PROPOSAL],
    activity: extra.activity ?? [{ id: 'a1', kind: 'targets_proposed', byPilot: true, subject: null, count: 1, on: '2026-10-13T10:00:00Z' }],
    landingPages: extra.landingPages ?? [],
  };
}

function stubFetch(...answers: { status?: number; body: unknown }[]) {
  const fetchMock = vi.fn();
  for (const answer of answers) fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(answer.body), { status: answer.status ?? 200 }));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

const sent = (fetchMock: ReturnType<typeof vi.fn>, call = 0) => ({ url: fetchMock.mock.calls[call][0] as string, body: JSON.parse((fetchMock.mock.calls[call][1] as RequestInit).body as string) });

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('GrowthPilotApp', () => {
  it('starts with one input, the website, and sends it', async () => {
    const fetchMock = stubFetch({ status: 201, body: page({ status: 'analyzing' }) }, { body: page() });
    renderWithIntl(<GrowthPilotApp orgId="o" projectId="p" initial={null} />, { locale: 'en' });
    expect(screen.getByRole('heading', { name: 'Enter the website you want to grow' })).toBeInTheDocument();
    expect(screen.getByText(/Type your website and the AI does the rest.*about a minute\./)).toBeInTheDocument();
    expect(screen.queryByText(/audiences/)).not.toBeInTheDocument();
    expect(screen.getByText('Nothing goes live without your approval. Every ad is created switched off, so nobody sees it until you turn it on.')).toBeInTheDocument();
    expect(screen.getByTestId('growth-pilot-start-button')).toBeDisabled();
    expect(screen.getByText('Proposes what to grow')).toBeInTheDocument();
    expect(screen.queryByText(/targets/i)).not.toBeInTheDocument();
    fireEvent.change(screen.getByTestId('growth-pilot-site-input'), { target: { value: 'easysign.co.il' } });
    fireEvent.click(screen.getByTestId('growth-pilot-start-button'));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(sent(fetchMock, 0)).toEqual({ url: BASE, body: { siteUrl: 'easysign.co.il' } });
    // Analyzing: the page asks the server to read the site, then shows what it proposed.
    expect(sent(fetchMock, 1).url).toBe(`${BASE}/advance`);
    expect(await screen.findByTestId('growth-pilot-center')).toBeInTheDocument();
  });

  it('tells a newcomer which address to enter, and ties the hint to the input', () => {
    renderWithIntl(<GrowthPilotApp orgId="o" projectId="p" initial={null} />, { locale: 'en' });
    const hint = screen.getByText(/Not sure which address\? Use your home page/).closest('p') as HTMLElement;
    expect(hint).toHaveTextContent('you do not need to log in or install anything');
    expect(hint).toHaveTextContent('No website yet? Any public page that describes what you sell works');
    expect(screen.getByTestId('growth-pilot-site-input')).toHaveAttribute('aria-describedby', hint.id);
  });

  it('says why an address was refused', async () => {
    stubFetch({ status: 400, body: { error: 'invalid_site' } });
    renderWithIntl(<GrowthPilotApp orgId="o" projectId="p" initial={null} />, { locale: 'en' });
    fireEvent.change(screen.getByTestId('growth-pilot-site-input'), { target: { value: 'nope' } });
    fireEvent.click(screen.getByTestId('growth-pilot-start-button'));
    expect(await screen.findByRole('alert')).toHaveTextContent('Enter a website address, like example.com.');
  });

  it('tells someone who pasted an email to enter the website, without calling the server', () => {
    const fetchMock = stubFetch();
    renderWithIntl(<GrowthPilotApp orgId="o" projectId="p" initial={null} />, { locale: 'en' });
    const input = screen.getByTestId('growth-pilot-site-input');
    fireEvent.change(input, { target: { value: ' me@easysign.co.il ' } });
    fireEvent.click(screen.getByTestId('growth-pilot-start-button'));
    expect(screen.getByRole('alert')).toHaveTextContent('That looks like an email address. Enter your website instead, like example.com.');
    expect(fetchMock).not.toHaveBeenCalled();
    fireEvent.change(input, { target: { value: 'easysign.co.il' } });
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('says the email mistake in Hebrew', () => {
    renderWithIntl(<GrowthPilotApp orgId="o" projectId="p" initial={null} />, { locale: 'he' });
    fireEvent.change(screen.getByTestId('growth-pilot-site-input'), { target: { value: 'me@easysign.co.il' } });
    fireEvent.click(screen.getByTestId('growth-pilot-start-button'));
    expect(screen.getByRole('alert')).toHaveTextContent(heMessages.GrowthPilot.errors.invalid_site_email);
  });

  it.each([
    ['en', 'We could not reach GrowthOS. Check your internet connection and try again - nothing was lost.'],
    ['he', heMessages.GrowthPilot.errors.offline],
  ] as const)('says the connection dropped, not "something went wrong" (%s)', async (locale, text) => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    renderWithIntl(<GrowthPilotApp orgId="o" projectId="p" initial={null} />, { locale });
    fireEvent.change(screen.getByTestId('growth-pilot-site-input'), { target: { value: 'easysign.co.il' } });
    fireEvent.click(screen.getByTestId('growth-pilot-start-button'));
    expect(await screen.findByRole('alert')).toHaveTextContent(text);
  });

  it.each([
    ['en', 'You were signed out. Reload the page and sign in again - nothing was lost.'],
    ['he', heMessages.GrowthPilot.errors.unauthorized],
  ] as const)('a lost session says to sign in again, not "try again in a minute" (%s)', async (locale, text) => {
    stubFetch({ status: 401, body: { error: 'unauthorized' } });
    renderWithIntl(<GrowthPilotApp orgId="o" projectId="p" initial={null} />, { locale });
    fireEvent.change(screen.getByTestId('growth-pilot-site-input'), { target: { value: 'easysign.co.il' } });
    fireEvent.click(screen.getByTestId('growth-pilot-start-button'));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(text);
    expect(alert.textContent ?? '').not.toMatch(/unauthorized/i);
  });

  it.each([
    ['en', 'We could not do that just now, and nothing was changed. Try again in a minute. If it keeps happening, reload the page.'],
    ['he', heMessages.GrowthPilot.errors.generic],
  ] as const)('an unknown error says nothing was changed and what to do, not "something went wrong" (%s)', async (locale, text) => {
    stubFetch({ status: 500, body: { error: 'some_internal_code' } });
    renderWithIntl(<GrowthPilotApp orgId="o" projectId="p" initial={null} />, { locale });
    fireEvent.change(screen.getByTestId('growth-pilot-site-input'), { target: { value: 'easysign.co.il' } });
    fireEvent.click(screen.getByTestId('growth-pilot-start-button'));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(text);
    expect(alert.textContent ?? '').not.toMatch(/some_internal_code|went wrong/i);
  });

  it.each([
    ['automation_stopped', 'Resume automation'],
    ['meta_unavailable', 'Ad platform connections'],
  ])('explains %s in plain words with where to go next', async (code, place) => {
    stubFetch({ status: 409, body: { error: code } });
    renderWithIntl(<GrowthPilotApp orgId="o" projectId="p" initial={null} />, { locale: 'en' });
    fireEvent.change(screen.getByTestId('growth-pilot-site-input'), { target: { value: 'easysign.co.il' } });
    fireEvent.click(screen.getByTestId('growth-pilot-start-button'));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(place);
    if (code === 'automation_stopped') expect(alert).toHaveTextContent('AI helper & automation');
    expect(alert.textContent ?? '').not.toMatch(/kill switch|Meta ad account|_/i);
  });

  it('while another caller reads the site, looks again until it is done', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const fetchMock = stubFetch({ body: page({ status: 'analyzing' }) }, { body: page() });
    renderWithIntl(<GrowthPilotApp orgId="o" projectId="p" initial={page({ status: 'analyzing' })} />, { locale: 'en' });
    expect(screen.getByTestId('growth-pilot-analyzing')).toHaveTextContent(`Reading ${isolate('easysign.co.il')}`);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    await vi.advanceTimersByTimeAsync(5000);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(await screen.findByTestId('growth-pilot-center')).toBeInTheDocument();
  });

  it('shows a failed read with the reason, and tries the same address again', async () => {
    const fetchMock = stubFetch({ status: 201, body: page({ status: 'analyzing' }) }, { body: page() });
    renderWithIntl(<GrowthPilotApp orgId="o" projectId="p" initial={page({ status: 'failed', failureCode: 'site_http_error' })} />, { locale: 'en' });
    const failed = screen.getByTestId('growth-pilot-failed');
    expect(failed).toHaveTextContent(`We could not finish reading ${isolate('easysign.co.il')}`);
    expect(failed).toHaveTextContent('The site did not open for us');
    fireEvent.click(within(failed).getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(sent(fetchMock, 0)).toEqual({ url: BASE, body: { siteUrl: 'https://easysign.co.il/' } }));
  });

  it('says a slow site is worth another try, and a redirect loop is not', () => {
    const slow = renderWithIntl(<GrowthPilotApp orgId="o" projectId="p" initial={page({ status: 'failed', failureCode: 'site_timeout' })} />, { locale: 'en' });
    expect(screen.getByTestId('growth-pilot-failed')).toHaveTextContent('The site took too long to answer');
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
    slow.unmount();
    renderWithIntl(<GrowthPilotApp orgId="o" projectId="p" initial={page({ status: 'failed', failureCode: 'site_too_many_redirects' })} />, { locale: 'en' });
    expect(screen.getByTestId('growth-pilot-failed')).toHaveTextContent('keeps sending visitors in a circle');
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
  });

  it('says a private address or a page with no text cannot be read, and offers no useless retry', () => {
    const view = (failureCode: string) => renderWithIntl(<GrowthPilotApp orgId="o" projectId="p" initial={page({ status: 'failed', failureCode })} />, { locale: 'en' });
    const blocked = view('site_blocked_url');
    expect(screen.getByTestId('growth-pilot-failed')).toHaveTextContent('not a public website page');
    expect(screen.getByTestId('growth-pilot-failed')).not.toHaveTextContent('site_blocked_url');
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Use another address' })).toBeInTheDocument();
    blocked.unmount();
    view('site_empty_page');
    expect(screen.getByTestId('growth-pilot-failed')).toHaveTextContent('no text we can read');
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
  });

  it('offers only the next steps that can work after a failed read', () => {
    const view = (failureCode: string) => renderWithIntl(<GrowthPilotApp orgId="o" projectId="p" initial={page({ status: 'failed', failureCode })} />, { locale: 'en' });
    const nothing = view('nothing_found');
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Use another address' })).toBeInTheDocument();
    nothing.unmount();
    const quota = view('quota_exceeded');
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Use another address' })).toBeNull();
    expect(screen.getByTestId('growth-pilot-failed')).toHaveTextContent('resets tomorrow');
    quota.unmount();
    const unavailable = view('provider_billing');
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Use another address' })).toBeNull();
    expect(screen.getByTestId('growth-pilot-failed')).toHaveTextContent('contact GrowthOS support');
    expect(screen.getByTestId('growth-pilot-failed')).not.toHaveTextContent('provider_billing');
    unavailable.unmount();
    view('provider_failed');
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });

  it('puts every proposal in front of the person to approve, reject or change', async () => {
    const approved = page({ proposals: [{ ...PROPOSAL, status: 'approved' }], targets: [{ ...page().targets[0], status: 'active' }] });
    const fetchMock = stubFetch({ body: approved });
    renderWithIntl(<GrowthPilotApp orgId="o" projectId="p" initial={page()} />, { locale: 'en' });
    const card = screen.getByTestId('growth-pilot-proposal');
    expect(card).toHaveTextContent('Digital signature');
    expect(card).toHaveTextContent('Service');
    expect(card).toHaveTextContent('For: Small law firms');
    expect(screen.getByRole('heading', { name: /Waiting for your approval/ })).toHaveTextContent('1');
    expect(screen.getByText('Approve a proposal and it becomes something the pilot works on.')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'What we are growing' })).toBeInTheDocument();
    expect(screen.getByTestId('growth-pilot-new-target')).toHaveTextContent('Something else to grow');

    fireEvent.click(within(card).getByTestId('growth-pilot-approve'));
    await waitFor(() => expect(sent(fetchMock)).toEqual({ url: `${BASE}/proposals/pr1`, body: { action: 'approve' } }));
    expect(await screen.findByTestId('growth-pilot-target')).toHaveTextContent('Active');
    expect(screen.getByText('Nothing waits for you right now.')).toBeInTheDocument();
  });

  it('sends a change request to the AI and shows it while the AI rewrites', async () => {
    const fetchMock = stubFetch({ body: page({ proposals: [{ ...PROPOSAL, status: 'revising', changes: [{ text: 'Only Tel Aviv', on: 'x', outcome: 'pending', failureCode: null }] }] }) });
    renderWithIntl(<GrowthPilotApp orgId="o" projectId="p" initial={page()} />, { locale: 'en' });
    fireEvent.click(screen.getByTestId('growth-pilot-change'));
    fireEvent.change(screen.getByTestId('growth-pilot-change-input'), { target: { value: 'Only Tel Aviv' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send to the AI' }));
    await waitFor(() => expect(sent(fetchMock)).toEqual({ url: `${BASE}/proposals/pr1`, body: { action: 'revise', request: 'Only Tel Aviv' } }));
    expect(await screen.findByText('The AI is updating this proposal...')).toBeInTheDocument();
    expect(screen.getByText('You asked: Only Tel Aviv')).toBeInTheDocument();
  });

  it('says when the AI could not make a change, and asks for a new target in the person words', async () => {
    const failedChange = { ...PROPOSAL, changes: [{ text: 'x', on: 'x', outcome: 'failed' as const, failureCode: 'quota_exceeded' }] };
    const fetchMock = stubFetch({ status: 201, body: page() });
    renderWithIntl(<GrowthPilotApp orgId="o" projectId="p" initial={page({ proposals: [failedChange] })} />, { locale: 'en' });
    expect(screen.getByTestId('growth-pilot-proposal')).toHaveTextContent('The AI could not make that change (today\'s AI limit is used up, it resets tomorrow). The proposal is unchanged.');
    fireEvent.click(screen.getByTestId('growth-pilot-new-target'));
    const form = screen.getByTestId('growth-pilot-new-target-form');
    fireEvent.change(within(form).getByRole('textbox'), { target: { value: 'Accountants in the north' } });
    fireEvent.click(within(form).getByRole('button', { name: 'Propose it' }));
    await waitFor(() => expect(sent(fetchMock)).toEqual({ url: `${BASE}/targets`, body: { request: 'Accountants in the north' } }));
  });

  it('words the activity log without the word "target"', () => {
    const activity: GrowthActivityView[] = [
      { id: 'a1', kind: 'targets_proposed', byPilot: true, subject: null, count: 3, on: '2026-10-13T10:00:00Z' },
      { id: 'a2', kind: 'target_requested', byPilot: false, subject: 'Accountants', count: null, on: '2026-10-13T11:00:00Z' },
    ];
    renderWithIntl(<GrowthPilotApp orgId="o" projectId="p" initial={page({ activity })} />, { locale: 'en' });
    const log = screen.getByTestId('growth-pilot-activity');
    expect(log).toHaveTextContent('Suggested 3 things to grow');
    expect(log).toHaveTextContent('You asked us to grow something new: Accountants');
    expect(log).not.toHaveTextContent(/target/i);
  });

  it('explains what Pause does, and that running ads are untouched', async () => {
    stubFetch({ body: page({ status: 'paused' }) });
    renderWithIntl(<GrowthPilotApp orgId="o" projectId="p" initial={page()} />, { locale: 'en' });
    expect(screen.getByTestId('growth-pilot-status-hint')).toHaveTextContent('Ads you already turned on keep running');
    fireEvent.click(screen.getByTestId('growth-pilot-pause'));
    await waitFor(() => expect(screen.getByTestId('growth-pilot-status-hint')).toHaveTextContent('Press Resume to continue'));
    expect(screen.getByTestId('growth-pilot-status-hint')).toHaveTextContent('keep running');
  });

  it('pauses the pilot, and reads in Hebrew with the activity worded', async () => {
    const fetchMock = stubFetch({ body: page({ status: 'paused' }) });
    renderWithIntl(<GrowthPilotApp orgId="o" projectId="p" initial={page()} />, { locale: 'he' });
    expect(screen.getByTestId('growth-pilot-status')).toHaveTextContent(heMessages.GrowthPilot.header.active);
    // "Suggested one thing to grow", worded by the Hebrew plural rule.
    expect(screen.getByTestId('growth-pilot-activity')).toHaveTextContent('\u05d4\u05e6\u05d9\u05e2 \u05d3\u05d1\u05e8 \u05d0\u05d7\u05d3 \u05dc\u05e7\u05d3\u05dd');
    fireEvent.click(screen.getByTestId('growth-pilot-pause'));
    await waitFor(() => expect(sent(fetchMock)).toEqual({ url: `${BASE}/pause`, body: { paused: true } }));
    expect(await screen.findByText(heMessages.GrowthPilot.header.paused)).toBeInTheDocument();
  });

  describe('ads', () => {
    const ACTIVE_TARGET = { id: 't1', kind: 'service' as const, name: 'Pro plan', description: '20 documents', audience: 'Small offices', status: 'active' as const, origin: 'site' as const, briefId: 'b1', adsStatus: 'ready' as const, adsFailure: null, landingPageId: null, landingStatus: 'published' as const, landingFailure: null, audienceStatus: 'approved' as const, audienceFailure: null, publishStatus: 'none' as const, publishFailure: null };
    const ADS: GrowthProposalView = { ...PROPOSAL, id: 'ad1', kind: 'ads', briefId: 'b1', previewImageIds: ['i1', 'i2'], draft: { kind: 'service', name: 'Pro plan', description: '', audience: '', reason: '' } };

    it('shows the ads with previews, a way into the Ad Studio, and the same approve / change / reject', async () => {
      const fetchMock = stubFetch({ body: page({ proposals: [{ ...ADS, status: 'revising', changes: [{ text: 'Brighter', on: 'x', outcome: 'pending', failureCode: null }] }], targets: [ACTIVE_TARGET] }) });
      renderWithIntl(<GrowthPilotApp orgId="o" projectId="p" initial={page({ proposals: [ADS], targets: [ACTIVE_TARGET] })} />, { locale: 'en' });
      const card = screen.getByTestId('growth-pilot-proposal');
      expect(card).toHaveTextContent(`Ads for ${isolate('Pro plan')}`);
      const images = within(screen.getByTestId('growth-pilot-ads-preview')).getAllByRole('presentation', { hidden: true });
      expect(images.map((image) => image.getAttribute('src'))).toEqual(['/api/orgs/o/projects/p/ad-studio/briefs/b1/images/i1/media', '/api/orgs/o/projects/p/ad-studio/briefs/b1/images/i2/media']);
      expect(screen.getByTestId('growth-pilot-open-studio')).toHaveAttribute('href', '/orgs/o/projects/p/ad-studio?brief=b1&step=review');
      expect(screen.getByTestId('growth-pilot-target-ads')).toHaveTextContent('Ads are waiting for your approval');

      fireEvent.click(screen.getByTestId('growth-pilot-change'));
      expect(screen.getByTestId('growth-pilot-change-input')).toHaveAttribute('placeholder', expect.stringContaining('brighter photos'));
      fireEvent.change(screen.getByTestId('growth-pilot-change-input'), { target: { value: 'Brighter' } });
      fireEvent.click(screen.getByRole('button', { name: 'Send to the AI' }));
      await waitFor(() => expect(sent(fetchMock)).toEqual({ url: BASE + '/proposals/ad1', body: { action: 'revise', request: 'Brighter' } }));
      expect(await screen.findByText('The AI is rewriting the ideas and making new images...')).toBeInTheDocument();
    });

    it('keeps advancing while ads are being made, one unit per call, and stops when they are ready', async () => {
      const building = page({ proposals: [], targets: [{ ...ACTIVE_TARGET, adsStatus: 'building' }] });
      const fetchMock = stubFetch({ body: building }, { body: page({ proposals: [ADS], targets: [ACTIVE_TARGET] }) });
      renderWithIntl(<GrowthPilotApp orgId="o" projectId="p" initial={building} />, { locale: 'en' });
      expect(screen.getByTestId('growth-pilot-target-ads')).toHaveAttribute('data-ads', 'building');
      await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2), { timeout: 4000 });
      expect(fetchMock.mock.calls.every((call) => call[0] === BASE + '/advance')).toBe(true);
      expect(await screen.findByText(`Ads for ${isolate('Pro plan')}`)).toBeInTheDocument();
      await new Promise((resolve) => setTimeout(resolve, 1800));
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('never shows a raw failure code: unknown ones become a plain sentence, in Hebrew too', () => {
      const target = { ...ACTIVE_TARGET, publishStatus: 'failed' as const, publishFailure: 'meta_error_190', adsStatus: 'failed' as const, adsFailure: 'no_images' };
      const view = renderWithIntl(<GrowthPilotApp orgId="o" projectId="p" initial={page({ proposals: [], targets: [target] })} />, { locale: 'en' });
      expect(screen.getByText('Publishing failed (something went wrong, try again in a minute)')).toBeInTheDocument();
      expect(screen.getByText('The ads could not be made (no image passed the quality check)')).toBeInTheDocument();
      expect(view.container).not.toHaveTextContent('meta_error_190');
      view.unmount();
      const he = renderWithIntl(<GrowthPilotApp orgId="o" projectId="p" initial={page({ proposals: [], targets: [target] })} />, { locale: 'he' });
      expect(he.container).not.toHaveTextContent('meta_error_190');
      expect(he.container).not.toHaveTextContent('no_images');
    });

    it('says when trying again will not help (AI account out of credit) and never leaks the code, in Hebrew too', () => {
      const target = { ...ACTIVE_TARGET, adsStatus: 'failed' as const, adsFailure: 'provider_billing', publishStatus: 'failed' as const, publishFailure: 'upload_failed' };
      const view = renderWithIntl(<GrowthPilotApp orgId="o" projectId="p" initial={page({ proposals: [], targets: [target] })} />, { locale: 'en' });
      expect(view.container).toHaveTextContent('trying again will not help - please contact GrowthOS support');
      expect(view.container).toHaveTextContent('the upload to Facebook and Instagram did not go through');
      expect(view.container).not.toHaveTextContent('provider_billing');
      expect(view.container).not.toHaveTextContent('upload_failed');
      view.unmount();
      const he = renderWithIntl(<GrowthPilotApp orgId="o" projectId="p" initial={page({ proposals: [], targets: [target] })} />, { locale: 'he' });
      expect(he.container).toHaveTextContent('ניסיון נוסף לא יעזור');
      expect(he.container).not.toHaveTextContent('provider_billing');
    });

    it('words a timed-out or idea-less ads run in plain language, in Hebrew too', () => {
      const target = { ...ACTIVE_TARGET, adsStatus: 'failed' as const, adsFailure: 'timed_out', publishStatus: 'failed' as const, publishFailure: 'no_concepts' };
      const view = renderWithIntl(<GrowthPilotApp orgId="o" projectId="p" initial={page({ proposals: [], targets: [target] })} />, { locale: 'en' });
      expect(view.container).toHaveTextContent('it took too long and was given up');
      expect(view.container).toHaveTextContent('could not come up with ideas');
      expect(view.container).not.toHaveTextContent('something went wrong');
      expect(view.container).not.toHaveTextContent('timed_out');
      view.unmount();
      const he = renderWithIntl(<GrowthPilotApp orgId="o" projectId="p" initial={page({ proposals: [], targets: [target] })} />, { locale: 'he' });
      expect(he.container).toHaveTextContent('לקח יותר מדי זמן');
      expect(he.container).not.toHaveTextContent('no_concepts');
    });

    it('explains a restricted ad account in words, in both languages', () => {
      const target = { ...ACTIVE_TARGET, publishStatus: 'failed' as const, publishFailure: 'meta_account_restricted' };
      const view = renderWithIntl(<GrowthPilotApp orgId="o" projectId="p" initial={page({ proposals: [], targets: [target] })} />, { locale: 'en' });
      expect(view.container).toHaveTextContent('Facebook has restricted your ad account');
      expect(view.container).not.toHaveTextContent('meta_account_restricted');
      expect(view.container).not.toHaveTextContent('something went wrong');
      view.unmount();
      const he = renderWithIntl(<GrowthPilotApp orgId="o" projectId="p" initial={page({ proposals: [], targets: [target] })} />, { locale: 'he' });
      expect(he.container).toHaveTextContent('הגבילה את חשבון המודעות');
      expect(he.container).not.toHaveTextContent('meta_account_restricted');
    });

    it('explains a publish failure the person can act on instead of "try again"', () => {
      const target = { ...ACTIVE_TARGET, publishStatus: 'failed' as const, publishFailure: 'account_action_required' };
      const view = renderWithIntl(<GrowthPilotApp orgId="o" projectId="p" initial={page({ proposals: [], targets: [target] })} />, { locale: 'en' });
      expect(view.container).toHaveTextContent('verify your ad account in Ads Manager');
      expect(view.container).not.toHaveTextContent('account_action_required');
      view.unmount();
      const auth = { ...target, publishFailure: 'auth_failed' };
      renderWithIntl(<GrowthPilotApp orgId="o" projectId="p" initial={page({ proposals: [], targets: [auth] })} />, { locale: 'en' });
      expect(screen.getByText(/reconnect your ad account in Ad platform connections/)).toBeInTheDocument();
    });

    it('does not blame the daily AI limit when the ad platform rate-limits a publish', () => {
      const target = { ...ACTIVE_TARGET, publishStatus: 'failed' as const, publishFailure: 'quota_exceeded' };
      const view = renderWithIntl(<GrowthPilotApp orgId="o" projectId="p" initial={page({ proposals: [], targets: [target] })} />, { locale: 'en' });
      expect(view.container).toHaveTextContent('the ad platform is receiving too many requests');
      expect(view.container).not.toHaveTextContent('AI limit');
      view.unmount();
      const he = renderWithIntl(<GrowthPilotApp orgId="o" projectId="p" initial={page({ proposals: [], targets: [target] })} />, { locale: 'he' });
      expect(he.container).toHaveTextContent('פלטפורמת הפרסום מקבלת כרגע יותר מדי בקשות');
    });

    it('says why ads failed, and starts them for an approved target that has none yet', async () => {
      const waiting = page({ proposals: [], targets: [{ ...ACTIVE_TARGET, briefId: null, adsStatus: 'none' }] });
      const fetchMock = stubFetch({ body: page({ proposals: [], targets: [{ ...ACTIVE_TARGET, adsStatus: 'failed', adsFailure: 'quota_exceeded' }] }) });
      renderWithIntl(<GrowthPilotApp orgId="o" projectId="p" initial={waiting} />, { locale: 'en' });
      await waitFor(() => expect(sent(fetchMock).url).toBe(BASE + '/advance'));
      expect(await screen.findByText('The ads could not be made (today\'s AI limit is used up, it resets tomorrow)')).toBeInTheDocument();
    });
  });

  describe('landing pages', () => {
    const CONTENT = { eyebrow: 'For small offices', headline: 'Sign 20 documents a month', subheadline: 'On WhatsApp, for 20 ILS.', benefits: [{ title: 'Fast', text: 'Signed in seconds' }], steps: ['Upload', 'Send'], faq: [{ question: 'Price?', answer: '20 ILS a month' }], ctaText: 'Start now', closingHeadline: 'Ready to sign?' };
    const PAGE = { id: 'lp1', targetId: 't1', slug: 'abcDEF123456', status: 'draft' as const, content: CONTENT, dir: 'ltr' as const, ctaUrl: 'https://easy-sign.co.il/?utm_source=growthos&utm_medium=landing_page&utm_campaign=abcDEF123456' };
    const TARGET = { id: 't1', kind: 'service' as const, name: 'Pro plan', description: '20 documents', audience: 'Small offices', status: 'active' as const, origin: 'site' as const, briefId: 'b1', adsStatus: 'approved' as const, adsFailure: null, landingPageId: 'lp1', landingStatus: 'ready' as const, landingFailure: null, audienceStatus: 'approved' as const, audienceFailure: null, publishStatus: 'none' as const, publishFailure: null };
    const PROPOSAL_LP: GrowthProposalView = { ...PROPOSAL, id: 'p-lp', kind: 'landing_page', landingPageId: 'lp1', draft: { kind: 'service', name: 'Pro plan', description: '', audience: '', reason: '' } };

    it('shows the page it proposes, as visitors will see it, with the button leading to the tagged site', () => {
      renderWithIntl(<GrowthPilotApp orgId="o" projectId="p" initial={page({ proposals: [PROPOSAL_LP], targets: [TARGET], landingPages: [PAGE] })} />, { locale: 'en' });
      const card = screen.getByTestId('growth-pilot-proposal');
      expect(card).toHaveTextContent(`Landing page for ${isolate('Pro plan')}`);
      expect(card).toHaveTextContent('The page people see after they click your ad.');
      expect(card).toHaveTextContent('Sign 20 documents a month - On WhatsApp, for 20 ILS.');
      expect(screen.queryByTestId('growth-pilot-landing-preview')).toBeNull();
      fireEvent.click(screen.getByTestId('growth-pilot-landing-toggle'));
      const preview = screen.getByTestId('growth-pilot-landing-preview');
      expect(within(preview).getByRole('heading', { level: 1 })).toHaveTextContent('Sign 20 documents a month');
      expect(within(preview).getByTestId('growth-landing-cta')).toHaveAttribute('href', PAGE.ctaUrl);
      expect(preview).toHaveTextContent('/lp/abcDEF123456');
      expect(screen.getByTestId('growth-pilot-target-landing')).toHaveTextContent('Landing page waiting for your approval');
    });

    it('links a published page from its target, and says why one could not be written', () => {
      renderWithIntl(
        <GrowthPilotApp
          orgId="o"
          projectId="p"
          initial={page({ proposals: [], targets: [{ ...TARGET, landingStatus: 'published' }, { ...TARGET, id: 't2', landingPageId: null, landingStatus: 'failed', landingFailure: 'quota_exceeded', audienceStatus: 'approved' as const, audienceFailure: null, publishStatus: 'none' as const, publishFailure: null }], landingPages: [{ ...PAGE, status: 'published' }] })}
        />,
        { locale: 'en' },
      );
      const [live, failed] = screen.getAllByTestId('growth-pilot-target-landing');
      expect(live).toHaveTextContent('Landing page live');
      expect(within(live).getByTestId('growth-pilot-landing-link')).toHaveAttribute('href', '/lp/abcDEF123456');
      expect(failed).toHaveTextContent('The landing page could not be written (today\'s AI limit is used up, it resets tomorrow)');
    });
  });

  describe('audiences', () => {
    const TARGET = { id: 't1', kind: 'audience' as const, name: 'Freelancers', description: 'Self-employed', audience: 'Fast', status: 'active' as const, origin: 'site' as const, briefId: 'b1', adsStatus: 'approved' as const, adsFailure: null, landingPageId: null, landingStatus: 'published' as const, landingFailure: null, audienceStatus: 'ready' as const, audienceFailure: null, publishStatus: 'none' as const, publishFailure: null };
    const PLAN = { summary: 'Freelancers in Israel who sign contracts', targeting: { countries: ['IL'], ageMin: 25, ageMax: 65, genders: [] as ('male' | 'female')[], customAudiences: [], interests: [{ id: 'i1', name: 'Freelancer', sizeLower: 1, sizeUpper: 2 }] }, unresolvedInterests: ['Paperwork'], reach: { lower: 52000, upper: 81000 }, meta: 'ok' };
    const AUDIENCE: GrowthProposalView = { ...PROPOSAL, id: 'p-aud', kind: 'audience', audience: PLAN, draft: { kind: 'audience', name: 'Freelancers', description: '', audience: '', reason: '' } };

    it('shows who the ads reach - countries, ages, genders, matched interests, the reach - for approval', () => {
      renderWithIntl(<GrowthPilotApp orgId="o" projectId="p" initial={page({ proposals: [AUDIENCE], targets: [TARGET] })} />, { locale: 'en' });
      const card = screen.getByTestId('growth-pilot-proposal');
      expect(card).toHaveTextContent(`Audience for ${isolate('Freelancers')}`);
      const audience = screen.getByTestId('growth-pilot-audience');
      expect(audience).toHaveTextContent('Freelancers in Israel who sign contracts');
      expect(audience).toHaveTextContent('Israel');
      expect(audience).toHaveTextContent('Ages 25-65+');
      expect(audience).toHaveTextContent('Everyone');
      expect(screen.getAllByTestId('growth-pilot-audience-interest').map((chip) => chip.textContent)).toEqual(['Freelancer']);
      expect(audience).toHaveTextContent('Paperwork');
      expect(screen.getByTestId('growth-pilot-audience-reach')).toHaveTextContent(/Facebook and Instagram estimate 52K-81K people a month/);
      expect(screen.queryByTestId('growth-pilot-audience-meta')).toBeNull();
      expect(screen.getByTestId('growth-pilot-target-audience')).toHaveTextContent('Audience waiting for your approval');
    });

    it('an approved audience says what happens next, in English and Hebrew', () => {
      const { unmount } = renderWithIntl(<GrowthPilotApp orgId="o" projectId="p" initial={page({ proposals: [], targets: [{ ...TARGET, audienceStatus: 'approved' }] })} />, { locale: 'en' });
      expect(screen.getByTestId('growth-pilot-target-audience')).toHaveTextContent('the ads will be shown to these people once you publish them');
      unmount();
      renderWithIntl(<GrowthPilotApp orgId="o" projectId="p" initial={page({ proposals: [], targets: [{ ...TARGET, audienceStatus: 'approved' }] })} />, { locale: 'he' });
      expect(screen.getByTestId('growth-pilot-target-audience')).toHaveTextContent('כשתפרסמו אותן');
    });

    it('without Meta says how to get the interests matched, and shows a failed audience with its reason', () => {
      const noMeta = { ...AUDIENCE, audience: { ...PLAN, meta: 'no_meta_credential', reach: null, targeting: { ...PLAN.targeting, interests: [], genders: ['female' as const] } } };
      renderWithIntl(<GrowthPilotApp orgId="o" projectId="p" initial={page({ proposals: [noMeta], targets: [{ ...TARGET, audienceStatus: 'failed', audienceFailure: 'quota_exceeded' }] })} />, { locale: 'en' });
      expect(screen.getByTestId('growth-pilot-audience-meta')).toHaveTextContent('Connect your Facebook and Instagram (Meta) ad account');
      expect(screen.getByTestId('growth-pilot-audience')).toHaveTextContent('Women');
      expect(screen.queryByTestId('growth-pilot-audience-reach')).toBeNull();
      expect(screen.getByTestId('growth-pilot-audience-meta').textContent ?? '').not.toMatch(/^Meta /);
      expect(screen.getByTestId('growth-pilot-target-audience')).toHaveTextContent('The audience could not be planned (today\'s AI limit is used up, it resets tomorrow)');
    });
  });

  describe('publishing', () => {
    const TARGET = { id: 't1', kind: 'service' as const, name: 'Free plan', description: '', audience: '', status: 'active' as const, origin: 'site' as const, briefId: 'b1', adsStatus: 'approved' as const, adsFailure: null, landingPageId: null, landingStatus: 'published' as const, landingFailure: null, audienceStatus: 'approved' as const, audienceFailure: null, publishStatus: 'ready' as const, publishFailure: null };
    const PLAN = { destination: 'meta' as const, imageIds: ['i1', 'i2'], dailyBudget: 20, linkUrl: 'https://app.growthos.io/lp/abc', campaignName: 'EasySign - Free plan', countries: ['IL'] };
    const PUBLISH: GrowthProposalView = { ...PROPOSAL, id: 'pub1', kind: 'publish', briefId: 'b1', publish: PLAN, previewImageIds: ['i1', 'i2'], draft: { kind: 'service', name: 'Free plan', description: '', audience: '', reason: '' } };

    it('publishes the approved images paused, at the budget the person sets - a yes or no, not a change for the AI', async () => {
      const fetchMock = stubFetch({ body: page({ proposals: [], targets: [{ ...TARGET, publishStatus: 'published' }] }) }, { body: { status: 'ok', since: 'a', until: 'b', summary: { totals: { spend: 0, impressions: 0, clicks: 0, linkClicks: 0, conversions: 0, ctr: null, cpc: null, costPerConversion: null }, daily: [], byTarget: {} } } });
      renderWithIntl(<GrowthPilotApp orgId="o" projectId="p" initial={page({ proposals: [PUBLISH], targets: [TARGET] })} />, { locale: 'en' });
      const card = screen.getByTestId('growth-pilot-proposal');
      expect(card).toHaveTextContent(`Publish the ads for ${isolate('Free plan')}`);
      expect(screen.getByTestId('growth-pilot-publish')).toHaveTextContent('The 2 approved images go to Facebook and Instagram (Meta) as ready-but-switched-off ads');
      expect(screen.getByTestId('growth-pilot-publish')).toHaveTextContent('https://app.growthos.io/lp/abc');
      expect(screen.getByTestId('growth-pilot-publish')).toHaveTextContent('Where people land after clicking: https://app.growthos.io/lp/abc');
      expect(screen.getByTestId('growth-pilot-publish')).toHaveTextContent('Countries: Israel');
      expect(within(screen.getByTestId('growth-pilot-ads-preview')).getAllByRole('presentation', { hidden: true })).toHaveLength(2);
      expect(within(card).queryByTestId('growth-pilot-change')).toBeNull();
      expect(screen.getByTestId('growth-pilot-budget')).toHaveAccessibleDescription('The most you will spend per day, once you turn the ads on. Nothing is spent before that.');
      fireEvent.change(screen.getByTestId('growth-pilot-budget'), { target: { value: '0' } });
      expect(within(card).getByTestId('growth-pilot-approve')).toBeDisabled();
      expect(screen.getByTestId('growth-pilot-budget')).toHaveAccessibleDescription(/Enter a daily budget above zero to publish/);
      fireEvent.change(screen.getByTestId('growth-pilot-budget'), { target: { value: '35' } });
      expect(screen.getByTestId('growth-pilot-budget')).toHaveAccessibleDescription(/^The most you will spend/);
      fireEvent.click(within(card).getByTestId('growth-pilot-approve'));
      await waitFor(() => expect(sent(fetchMock)).toEqual({ url: BASE + '/proposals/pub1', body: { action: 'approve', dailyBudget: 35 } }));
      expect(await screen.findByTestId('growth-pilot-target-publish')).toHaveTextContent('On Facebook and Instagram, switched off - not showing to anyone');
    });

    it('names the countries in the reader\'s language instead of codes', () => {
      renderWithIntl(<GrowthPilotApp orgId="o" projectId="p" initial={page({ proposals: [PUBLISH], targets: [TARGET] })} />, { locale: 'he' });
      expect(screen.getByTestId('growth-pilot-publish')).toHaveTextContent('ישראל');
      expect(screen.getByTestId('growth-pilot-publish')).not.toHaveTextContent('IL');
    });

    it('turning on is its own decision, saying it starts spending', () => {
      const ACTIVATE = { ...PUBLISH, id: 'act1', kind: 'activate' as const };
      renderWithIntl(<GrowthPilotApp orgId="o" projectId="p" initial={page({ proposals: [ACTIVATE], targets: [{ ...TARGET, publishStatus: 'published' }] })} />, { locale: 'en' });
      expect(screen.getByTestId('growth-pilot-proposal')).toHaveTextContent(`Turn on the ads for ${isolate('Free plan')}`);
      expect(screen.getByTestId('growth-pilot-publish')).toHaveTextContent('Turning them on makes them visible and starts spending - up to 20 a day');
      expect(screen.getByTestId('growth-pilot-approve')).toHaveTextContent('Turn on the ads');
      expect(screen.queryByTestId('growth-pilot-budget')).toBeNull();
    });

    it('turning on asks once more, naming the daily spend, and sends nothing until the person says yes', async () => {
      const ACTIVATE = { ...PUBLISH, id: 'act1', kind: 'activate' as const };
      const fetchMock = stubFetch({ body: page({ proposals: [], targets: [{ ...TARGET, publishStatus: 'running' }] }) });
      renderWithIntl(<GrowthPilotApp orgId="o" projectId="p" initial={page({ proposals: [ACTIVATE], targets: [{ ...TARGET, publishStatus: 'published' }] })} />, { locale: 'en' });
      fireEvent.click(screen.getByTestId('growth-pilot-approve'));
      expect(screen.getByTestId('growth-pilot-approve')).toHaveTextContent('Yes, turn on - spend up to 20 a day');
      expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/proposals/'))).toBe(false);
      fireEvent.click(screen.getByTestId('growth-pilot-activate-cancel'));
      expect(screen.getByTestId('growth-pilot-approve')).toHaveTextContent('Turn on the ads');
      fireEvent.click(screen.getByTestId('growth-pilot-approve'));
      fireEvent.click(screen.getByTestId('growth-pilot-approve'));
      await waitFor(() => expect(fetchMock.mock.calls.some(([url]) => url === BASE + '/proposals/act1')).toBe(true));
      const call = fetchMock.mock.calls.findIndex(([url]) => url === BASE + '/proposals/act1');
      expect(sent(fetchMock, call).body).toEqual({ action: 'approve' });
    });

    it('explains "paused" in plain words in both languages, never the platform term alone', () => {
      for (const [locale, word] of [['en', 'switched-off'], ['he', 'כבוי']] as const) {
        const view = renderWithIntl(<GrowthPilotApp orgId="o" projectId="p" initial={page({ proposals: [PUBLISH], targets: [TARGET] })} />, { locale });
        expect(screen.getByTestId('growth-pilot-publish')).toHaveTextContent(word);
        expect(screen.getByTestId('growth-pilot-publish')).not.toHaveTextContent(/paused|ad set|מושה/);
        view.unmount();
      }
    });

    it('shows how to connect Meta when that is what publishing waits for', () => {
      renderWithIntl(<GrowthPilotApp orgId="o" projectId="p" metaConnectHref="/api/integrations/meta/start?orgId=o" initial={page({ proposals: [], targets: [{ ...TARGET, publishStatus: 'needs_meta' }] })} />, { locale: 'en' });
      const line = screen.getByTestId('growth-pilot-target-publish');
      expect(line).toHaveTextContent('Ready to publish once your Facebook and Instagram (Meta) ad account is connected.');
      expect(within(line).getByTestId('growth-pilot-connect-meta')).toHaveAttribute('href', '/api/integrations/meta/start?orgId=o');
    });
  });

  it('shows each published target its own clicks and spend from Meta', async () => {
    const TARGET = { id: 't1', kind: 'service' as const, name: 'Free plan', description: '', audience: '', status: 'active' as const, origin: 'site' as const, briefId: 'b1', adsStatus: 'approved' as const, adsFailure: null, landingPageId: null, landingStatus: 'published' as const, landingFailure: null, audienceStatus: 'approved' as const, audienceFailure: null, publishStatus: 'running' as const, publishFailure: null };
    const totals = { spend: 84.5, impressions: 1000, clicks: 310, linkClicks: 200, conversions: 3, ctr: 0.31, cpc: 0.27, costPerConversion: 28.17 };
    stubFetch({ body: { status: 'ok', since: 'a', until: 'b', summary: { totals, daily: [], byTarget: { t1: totals } } } });
    renderWithIntl(<GrowthPilotApp orgId="o" projectId="p" initial={page({ proposals: [], targets: [TARGET] })} />, { locale: 'en' });
    expect(await screen.findByTestId('growth-pilot-target-results')).toHaveTextContent('310 clicks, 84.5 spent');
    expect(screen.getByTestId('growth-pilot-target-publish')).toHaveTextContent('Ads are running');
  });
});
