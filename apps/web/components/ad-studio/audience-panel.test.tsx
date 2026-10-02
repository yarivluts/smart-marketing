import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import React from 'react';
import { renderWithIntl } from '@/tests/e2e/helpers/test-harness';
import enMessages from '@/messages/en.json';
import heMessages from '@/messages/he.json';
import { AudiencePanel } from './audience-panel';

const refresh = vi.fn();
vi.mock('@/i18n/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh }) }));

const BASE = '/api/orgs/o/projects/p/ad-studio/briefs/b1';
const en = enMessages.AdStudio.audience;
const he = heMessages.AdStudio.audience;

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

function graph() {
  return vi.fn(async (url: string) => {
    if (url === `${BASE}/audiences`) {
      return json({
        result: {
          status: 'ok',
          data: [
            {
              id: '2385',
              name: 'Website visitors',
              kind: 'custom',
              sizeLower: 1000,
              sizeUpper: 1200,
            },
            { id: '77', name: 'Lawyers TLV', kind: 'saved', sizeLower: null, sizeUpper: null },
          ],
        },
      });
    }
    if (url.startsWith(`${BASE}/audiences/interests`))
      return json({
        result: {
          status: 'ok',
          data: [{ id: '600', name: 'Law', sizeLower: 5000000, sizeUpper: 6000000 }],
        },
      });
    if (url === `${BASE}/audiences/estimate`)
      return json({
        result: { status: 'ok', data: { monthlyLower: 120000, monthlyUpper: 140000, ready: true } },
      });
    if (url.startsWith(`${BASE}/audiences/performance`))
      return json({
        result: {
          status: 'ok',
          data: [
            {
              segment: ['25-34', 'female'],
              spend: 40,
              impressions: 1000,
              clicks: 30,
              linkClicks: 20,
              conversions: 2,
            },
          ],
        },
      });
    if (url === `${BASE}/targeting`) return json({ brief: {} });
    throw new Error(`Unexpected ${url}`);
  });
}

describe('AudiencePanel', () => {
  it('builds an audience from the account audiences and interests, estimates its reach and saves it', async () => {
    const fetchMock = graph();
    vi.stubGlobal('fetch', fetchMock);
    renderWithIntl(
      <AudiencePanel orgId="o" projectId="p" briefId="b1" language="en" initial={null} />,
      { locale: 'en' },
    );
    const list = await screen.findByTestId('ad-studio-meta-audiences');
    expect(within(list).getByText('1K-1.2K')).toBeInTheDocument();
    // A saved audience is a preset: listed, not selectable.
    expect(within(list).getAllByRole('checkbox')[1]).toBeDisabled();
    fireEvent.click(within(list).getAllByRole('checkbox')[0]);

    fireEvent.change(screen.getByLabelText(en.ageMin), { target: { value: '25' } });
    fireEvent.click(screen.getByRole('radio', { name: en.genders.female }));
    fireEvent.change(screen.getByLabelText(en.interestPlaceholder), { target: { value: 'law' } });
    fireEvent.click(screen.getByRole('button', { name: en.searchInterests }));
    fireEvent.click(await screen.findByRole('button', { name: 'Add Law' }));
    expect(
      within(screen.getByTestId('ad-studio-chosen-interests')).getByText('Law'),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: en.estimate }));
    expect(await screen.findByTestId('ad-studio-reach-estimate')).toHaveTextContent(
      'About 120K-140K people a month',
    );

    fireEvent.click(screen.getByRole('button', { name: en.save }));
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(en.saved));
    const saveCall = fetchMock.mock.calls.find(
      ([url]) => url === `${BASE}/targeting`,
    ) as unknown as [string, RequestInit];
    expect(JSON.parse(String(saveCall[1].body)).targeting).toEqual({
      countries: ['US'],
      ageMin: 25,
      ageMax: 65,
      genders: ['female'],
      customAudiences: [{ id: '2385', name: 'Website visitors', sizeLower: 1000, sizeUpper: 1200 }],
      interests: [{ id: '600', name: 'Law', sizeLower: 5000000, sizeUpper: 6000000 }],
    });
    expect(refresh).toHaveBeenCalled();
  });

  it('shows past results per segment in the viewer language, and why when Meta is not connected', async () => {
    const fetchMock = vi.fn(async (url: string) =>
      url === `${BASE}/audiences`
        ? json({ result: { status: 'unavailable', reason: 'no_meta_credential' } })
        : graph()(url),
    );
    vi.stubGlobal('fetch', fetchMock);
    renderWithIntl(
      <AudiencePanel orgId="o" projectId="p" briefId="b1" language="he" initial={null} />,
      { locale: 'he' },
    );
    expect(await screen.findByText(he.unavailable.no_meta_credential)).toBeInTheDocument();
    expect(screen.getByLabelText(he.countriesLabel)).toHaveValue('IL');
    fireEvent.click(screen.getByRole('tab', { name: he.breakdowns.age_gender }));
    const table = await screen.findByTestId('ad-studio-meta-performance');
    expect(within(table).getByText(`25-34 · ${he.segments.female}`)).toBeInTheDocument();
  });

  it('will not save targeting that breaks the rules', () => {
    vi.stubGlobal('fetch', graph());
    renderWithIntl(
      <AudiencePanel orgId="o" projectId="p" briefId="b1" language="en" initial={null} />,
      { locale: 'en' },
    );
    fireEvent.change(screen.getByLabelText(en.countriesLabel), { target: { value: 'Israel' } });
    expect(screen.getByText(en.issues.invalid_country)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: en.save })).toBeDisabled();
  });
});
