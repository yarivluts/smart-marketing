import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import React from 'react';
import { renderWithIntl } from '@/tests/e2e/helpers/test-harness';
import heMessages from '@/messages/he.json';
import type { GrowthPilotPageData, GrowthProposalView } from '@/lib/growth-pilot/view';
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
    targets: extra.targets ?? [{ id: 't1', kind: 'service', name: 'Digital signature', description: 'Sign in 30 seconds', audience: 'Small law firms', status: 'proposed', origin: 'site', briefId: null, adsStatus: 'none', adsFailure: null }],
    proposals: extra.proposals ?? [PROPOSAL],
    activity: extra.activity ?? [{ id: 'a1', kind: 'targets_proposed', byPilot: true, subject: null, count: 1, on: '2026-10-13T10:00:00Z' }],
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
    expect(screen.getByText('Nothing goes live without your approval. Every ad is created paused.')).toBeInTheDocument();
    expect(screen.getByTestId('growth-pilot-start-button')).toBeDisabled();
    fireEvent.change(screen.getByTestId('growth-pilot-site-input'), { target: { value: 'easysign.co.il' } });
    fireEvent.click(screen.getByTestId('growth-pilot-start-button'));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(sent(fetchMock, 0)).toEqual({ url: BASE, body: { siteUrl: 'easysign.co.il' } });
    // Analyzing: the page asks the server to read the site, then shows what it proposed.
    expect(sent(fetchMock, 1).url).toBe(`${BASE}/advance`);
    expect(await screen.findByTestId('growth-pilot-center')).toBeInTheDocument();
  });

  it('says why an address was refused', async () => {
    stubFetch({ status: 400, body: { error: 'invalid_site' } });
    renderWithIntl(<GrowthPilotApp orgId="o" projectId="p" initial={null} />, { locale: 'en' });
    fireEvent.change(screen.getByTestId('growth-pilot-site-input'), { target: { value: 'nope' } });
    fireEvent.click(screen.getByTestId('growth-pilot-start-button'));
    expect(await screen.findByRole('alert')).toHaveTextContent('Enter a website address, like example.com.');
  });

  it('while another caller reads the site, looks again until it is done', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const fetchMock = stubFetch({ body: page({ status: 'analyzing' }) }, { body: page() });
    renderWithIntl(<GrowthPilotApp orgId="o" projectId="p" initial={page({ status: 'analyzing' })} />, { locale: 'en' });
    expect(screen.getByTestId('growth-pilot-analyzing')).toHaveTextContent('Reading easysign.co.il');
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    await vi.advanceTimersByTimeAsync(5000);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(await screen.findByTestId('growth-pilot-center')).toBeInTheDocument();
  });

  it('shows a failed read with the reason, and tries the same address again', async () => {
    const fetchMock = stubFetch({ status: 201, body: page({ status: 'analyzing' }) }, { body: page() });
    renderWithIntl(<GrowthPilotApp orgId="o" projectId="p" initial={page({ status: 'failed', failureCode: 'site_http_error' })} />, { locale: 'en' });
    const failed = screen.getByTestId('growth-pilot-failed');
    expect(failed).toHaveTextContent('We could not finish reading easysign.co.il');
    expect(failed).toHaveTextContent('The site did not open for us');
    fireEvent.click(within(failed).getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(sent(fetchMock, 0)).toEqual({ url: BASE, body: { siteUrl: 'https://easysign.co.il/' } }));
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
    expect(screen.getByText('Approve a proposal and it becomes a target the pilot works on.')).toBeInTheDocument();

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
    expect(screen.getByTestId('growth-pilot-proposal')).toHaveTextContent('The AI could not make that change (quota_exceeded). The proposal is unchanged.');
    fireEvent.click(screen.getByTestId('growth-pilot-new-target'));
    const form = screen.getByTestId('growth-pilot-new-target-form');
    fireEvent.change(within(form).getByRole('textbox'), { target: { value: 'Accountants in the north' } });
    fireEvent.click(within(form).getByRole('button', { name: 'Propose it' }));
    await waitFor(() => expect(sent(fetchMock)).toEqual({ url: `${BASE}/targets`, body: { request: 'Accountants in the north' } }));
  });

  it('pauses the pilot, and reads in Hebrew with the activity worded', async () => {
    const fetchMock = stubFetch({ body: page({ status: 'paused' }) });
    renderWithIntl(<GrowthPilotApp orgId="o" projectId="p" initial={page()} />, { locale: 'he' });
    expect(screen.getByTestId('growth-pilot-status')).toHaveTextContent(heMessages.GrowthPilot.header.active);
    // "Proposed one target", worded by the Hebrew plural rule.
    expect(screen.getByTestId('growth-pilot-activity')).toHaveTextContent('\u05d4\u05e6\u05d9\u05e2 \u05d9\u05e2\u05d3 \u05d0\u05d7\u05d3');
    fireEvent.click(screen.getByTestId('growth-pilot-pause'));
    await waitFor(() => expect(sent(fetchMock)).toEqual({ url: `${BASE}/pause`, body: { paused: true } }));
    expect(await screen.findByText(heMessages.GrowthPilot.header.paused)).toBeInTheDocument();
  });

  describe('ads', () => {
    const ACTIVE_TARGET = { id: 't1', kind: 'service' as const, name: 'Pro plan', description: '20 documents', audience: 'Small offices', status: 'active' as const, origin: 'site' as const, briefId: 'b1', adsStatus: 'ready' as const, adsFailure: null };
    const ADS: GrowthProposalView = { ...PROPOSAL, id: 'ad1', kind: 'ads', briefId: 'b1', previewImageIds: ['i1', 'i2'], draft: { kind: 'service', name: 'Pro plan', description: '', audience: '', reason: '' } };

    it('shows the ads with previews, a way into the Ad Studio, and the same approve / change / reject', async () => {
      const fetchMock = stubFetch({ body: page({ proposals: [{ ...ADS, status: 'revising', changes: [{ text: 'Brighter', on: 'x', outcome: 'pending', failureCode: null }] }], targets: [ACTIVE_TARGET] }) });
      renderWithIntl(<GrowthPilotApp orgId="o" projectId="p" initial={page({ proposals: [ADS], targets: [ACTIVE_TARGET] })} />, { locale: 'en' });
      const card = screen.getByTestId('growth-pilot-proposal');
      expect(card).toHaveTextContent('Ads for Pro plan');
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
      expect(await screen.findByText('Ads for Pro plan')).toBeInTheDocument();
      await new Promise((resolve) => setTimeout(resolve, 1800));
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('says why ads failed, and starts them for an approved target that has none yet', async () => {
      const waiting = page({ proposals: [], targets: [{ ...ACTIVE_TARGET, briefId: null, adsStatus: 'none' }] });
      const fetchMock = stubFetch({ body: page({ proposals: [], targets: [{ ...ACTIVE_TARGET, adsStatus: 'failed', adsFailure: 'quota_exceeded' }] }) });
      renderWithIntl(<GrowthPilotApp orgId="o" projectId="p" initial={waiting} />, { locale: 'en' });
      await waitFor(() => expect(sent(fetchMock).url).toBe(BASE + '/advance'));
      expect(await screen.findByText('The ads could not be made (quota_exceeded)')).toBeInTheDocument();
    });
  });
});
