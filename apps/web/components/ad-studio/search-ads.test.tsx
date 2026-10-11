import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import React from 'react';
import { renderWithIntl } from '@/tests/e2e/helpers/test-harness';
import enMessages from '@/messages/en.json';
import heMessages from '@/messages/he.json';
import { KeywordResearch } from './keyword-research';
import { SearchAdEditor } from './search-ad-editor';

const refresh = vi.fn();
vi.mock('@/i18n/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh }) }));

const BASE = '/api/orgs/o/projects/p/ad-studio/briefs/b1';
const en = enMessages.AdStudio.search;
const he = heMessages.AdStudio.search;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  refresh.mockReset();
});

const IDEAS = [
  {
    keyword: 'electronic signature',
    avgMonthlySearches: 12100,
    competition: 'HIGH',
    lowTopOfPageBid: 2.1,
    highTopOfPageBid: 9.4,
  },
  {
    keyword: 'sign pdf',
    avgMonthlySearches: 880,
    competition: 'LOW',
    lowTopOfPageBid: null,
    highTopOfPageBid: null,
  },
];

describe('KeywordResearch', () => {
  it('looks keywords up in the chosen country, adds them with a match type and saves them with the negatives', async () => {
    const fetchMock = vi.fn(async (url: string) =>
      url.endsWith('/keywords/research')
        ? json({ research: { status: 'ok', ideas: IDEAS } })
        : json({ brief: {} }),
    );
    vi.stubGlobal('fetch', fetchMock);
    renderWithIntl(
      <KeywordResearch
        orgId="o"
        projectId="p"
        briefId="b1"
        language="en"
        landingPageUrl="https://easysign.example"
        initial={null}
        suggestedSeeds={['e signature']}
      />,
      { locale: 'en' },
    );
    fireEvent.change(screen.getByLabelText(en.countryLabel), { target: { value: 'US' } });
    fireEvent.click(screen.getByRole('button', { name: en.research }));
    const table = await screen.findByTestId('ad-studio-keyword-ideas');
    expect(within(table).getByText('12,100')).toBeInTheDocument();
    expect(within(table).getByText('2.1-9.4')).toBeInTheDocument();
    const [researchUrl, researchInit] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(researchUrl).toBe(`${BASE}/keywords/research`);
    expect(JSON.parse(String(researchInit.body))).toEqual({
      seeds: ['e signature'],
      url: 'https://easysign.example',
      targeting: { country: 'US', language: 'en' },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Add electronic signature' }));
    fireEvent.change(screen.getByLabelText('Match type for electronic signature'), {
      target: { value: 'EXACT' },
    });
    fireEvent.change(screen.getByLabelText(en.ownKeywordPlaceholder), {
      target: { value: 'Sign PDF' },
    });
    fireEvent.click(screen.getByRole('button', { name: en.addOwn }));
    expect(
      screen.getByText(en.selectedSearches.replace('{searches}', '12,980')),
    ).toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText(en.negativesPlaceholder), {
      target: { value: 'free, jobs' },
    });
    fireEvent.click(screen.getByRole('button', { name: en.saveKeywords }));

    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(en.keywordsSaved));
    const [saveUrl, saveInit] = fetchMock.mock.calls[1] as unknown as [string, RequestInit];
    expect(saveUrl).toBe(`${BASE}/keywords`);
    expect(JSON.parse(String(saveInit.body)).keywords).toEqual({
      targeting: { country: 'US', language: 'en' },
      keywords: [
        {
          text: 'electronic signature',
          matchType: 'EXACT',
          avgMonthlySearches: 12100,
          competition: 'HIGH',
          lowTopOfPageBid: 2.1,
          highTopOfPageBid: 9.4,
        },
        // Typed by hand but found in the research: it keeps Google's numbers.
        {
          text: 'sign pdf',
          matchType: 'PHRASE',
          avgMonthlySearches: 880,
          competition: 'LOW',
          lowTopOfPageBid: null,
          highTopOfPageBid: null,
        },
      ],
      negatives: ['free', 'jobs'],
    });
    expect(refresh).toHaveBeenCalled();
  });

  it('says why there are no volumes when Google Ads is not available', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        json({ research: { status: 'unavailable', reason: 'developer_token_not_approved' } }),
      ),
    );
    renderWithIntl(
      <KeywordResearch
        orgId="o"
        projectId="p"
        briefId="b1"
        language="he"
        landingPageUrl={null}
        initial={null}
        suggestedSeeds={[]}
      />,
      { locale: 'he' },
    );
    expect(screen.getByLabelText(he.countryLabel)).toHaveValue('IL');
    fireEvent.click(screen.getByRole('button', { name: he.research }));
    expect(
      await screen.findByText(he.unavailable.developer_token_not_approved),
    ).toBeInTheDocument();
  });
});

describe('SearchAdEditor', () => {
  const AD = {
    headlines: ['Sign in seconds', 'E-signatures for lawyers', 'Start free today'],
    descriptions: ['Upload, send, signed.', 'Legally binding in a minute.'],
    path1: 'sign',
    path2: 'lawyers',
  };

  it('counts Google limits as you type, previews the ad on a results page and saves it', async () => {
    const fetchMock = vi.fn(async () =>
      json({ brief: { searchAd: { ...AD, headlines: [...AD.headlines, 'Signed by lunch'] } } }),
    );
    vi.stubGlobal('fetch', fetchMock);
    renderWithIntl(
      <SearchAdEditor
        orgId="o"
        projectId="p"
        briefId="b1"
        initial={AD}
        keywordCount={2}
        linkUrl="https://www.easysign.example/lawyers"
        advertiser="EasySign"
        aiAvailable
      />,
      { locale: 'en' },
    );
    const preview = screen.getByTestId('ad-studio-search-preview');
    expect(within(preview).getByText('easysign.example/sign/lawyers')).toBeInTheDocument();
    expect(
      within(preview).getByText('Sign in seconds | E-signatures for lawyers | Start free today'),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: en.anotherCombination }));
    expect(
      within(preview).getByText('E-signatures for lawyers | Start free today | Sign in seconds'),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: en.addHeadline }));
    fireEvent.change(screen.getByLabelText('Headline 4'), { target: { value: 'x'.repeat(31) } });
    expect(screen.getByText('31/30')).toBeInTheDocument();
    expect(screen.getByText('headline 4 is longer than 30 characters')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: en.saveAd })).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Headline 4'), { target: { value: 'Signed by lunch' } });
    fireEvent.click(screen.getByRole('button', { name: en.saveAd }));
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(en.adSaved));
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`${BASE}/search-ad`);
    expect(JSON.parse(String(init.body)).ad.headlines).toEqual([
      ...AD.headlines,
      'Signed by lunch',
    ]);
  });

  it('asks before the AI replaces a saved ad, and writes the first one straight away', async () => {
    const fetchMock = vi.fn(async () => json({ brief: { searchAd: AD } }));
    vi.stubGlobal('fetch', fetchMock);
    const { unmount } = renderWithIntl(
      <SearchAdEditor
        orgId="o"
        projectId="p"
        briefId="b1"
        initial={null}
        keywordCount={0}
        linkUrl={null}
        advertiser="EasySign"
        aiAvailable
      />,
      { locale: 'en' },
    );
    expect(screen.getByText(en.noKeywordsYet)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: en.writeAd }));
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(en.adWritten));
    expect((fetchMock.mock.calls[0] as unknown as [string])[0]).toBe(`${BASE}/search-ad/generate`);
    expect(screen.getByLabelText('Headline 1')).toHaveValue('Sign in seconds');
    unmount();

    renderWithIntl(
      <SearchAdEditor
        orgId="o"
        projectId="p"
        briefId="b1"
        initial={AD}
        keywordCount={2}
        linkUrl={null}
        advertiser="EasySign"
        aiAvailable
      />,
      { locale: 'en' },
    );
    fireEvent.click(screen.getByRole('button', { name: en.rewriteAd }));
    expect(screen.getByText(en.confirmRewrite)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: en.cancel }));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
