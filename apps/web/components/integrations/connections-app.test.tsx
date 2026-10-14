import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import React from 'react';
import { AD_PLATFORM_FIELDS } from '@growthos/firebase-orm-models';
import { renderWithIntl } from '@/tests/e2e/helpers/test-harness';
import enMessages from '@/messages/en.json';
import heMessages from '@/messages/he.json';
import { CONNECTION_FIELDS, CONNECTION_GUIDE_LINKS, CONNECTION_PLATFORMS } from '@/lib/integrations/connection-fields';
import { ConnectionsApp, type ConnectionRow } from './connections-app';

const refresh = vi.fn();
vi.mock('@/i18n/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh }) }));

const en = enMessages.Connections;
const he = heMessages.Connections;
const PROJECTS = [{ id: 'p1', name: 'EasySign' }];

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

const META_ROW: ConnectionRow = {
  id: 'c1',
  provider: 'meta_ads',
  name: 'Meta Ads - Yariv Luts (act_1)',
  accountId: '1646897415410557',
  accountName: 'Yariv Luts',
  currency: 'ILS',
  hasSecret: true,
  connectedVia: 'oauth',
  tokenExpiresOn: null,
  lastCheckedOn: '2026-10-14T10:00:00.000Z',
  lastCheckStatus: 'ok',
  projects: ['EasySign'],
};

function renderApp(props: Partial<React.ComponentProps<typeof ConnectionsApp>> = {}, locale: 'en' | 'he' = 'en') {
  return renderWithIntl(
    <ConnectionsApp orgId="o" canManage projects={PROJECTS} connections={[]} initialProjectId={null} returnTo={null} metaConnectHref={null} focus={null} {...props} />,
    { locale },
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
  refresh.mockReset();
});

describe('Connections page data', () => {
  it('asks for exactly the fields the server checks, and every platform has its guide and words in both languages', () => {
    for (const platform of CONNECTION_PLATFORMS) {
      expect(CONNECTION_FIELDS[platform].filter((field) => field.required).map((field) => field.name)).toEqual(AD_PLATFORM_FIELDS[platform].required);
      expect(CONNECTION_FIELDS[platform].filter((field) => !field.required).map((field) => field.name)).toEqual(AD_PLATFORM_FIELDS[platform].optional);
      for (const messages of [en, he]) {
        const steps = (messages.platforms as Record<string, { steps: Record<string, string> }>)[platform]!.steps;
        expect(Object.keys(steps)).toHaveLength(CONNECTION_GUIDE_LINKS[platform].length);
        for (const field of CONNECTION_FIELDS[platform]) expect((messages.fields as Record<string, { label: string }>)[field.name]?.label).toBeTruthy();
      }
    }
  });
});

describe('ConnectionsApp', () => {
  it('shows each platform with what is connected, whether it works and where it is used', () => {
    renderApp({ connections: [META_ROW] });
    const meta = screen.getByTestId('connections-meta_ads');
    expect(within(meta).getByText('Yariv Luts (1646897415410557)')).toBeInTheDocument();
    expect(within(meta).getByText(en.status.ok)).toBeInTheDocument();
    expect(within(meta).getByText(en.usedIn.replace('{projects}', 'EasySign'))).toBeInTheDocument();
    expect(within(screen.getByTestId('connections-google_ads')).getByText(en.none)).toBeInTheDocument();
    expect(within(screen.getByTestId('connections-tiktok_ads')).getByText(en.none)).toBeInTheDocument();
  });

  it('guides through Google Ads, points at the wrong fields, explains a refusal, then saves a working connection to the project', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(json({ error: 'invalid_details', fields: ['customerId'] }, 400))
      .mockResolvedValueOnce(json({ check: { status: 'failed', reason: 'developer_token_not_approved' }, connection: null }))
      .mockResolvedValueOnce(json({ check: { status: 'ok', account: { id: '4816235600', name: 'EasySign Google Ads', currency: 'ILS' } }, created: true, connection: { ...META_ROW, id: 'g1', provider: 'google_ads', accountId: '4816235600', accountName: 'EasySign Google Ads', connectedVia: null } }));
    vi.stubGlobal('fetch', fetchMock);
    renderApp({ initialProjectId: 'p1', returnTo: '/en/orgs/o/projects/p1/ad-studio?step=publish', focus: 'google_ads' });
    const card = screen.getByTestId('connections-google_ads');
    // Opened on arrival because a link asked for Google Ads, with the guide and its links.
    expect(within(card).getByText(en.platforms.google_ads.steps['1'], { exact: false })).toBeInTheDocument();
    expect(within(card).getAllByRole('link', { name: en.open })[0]).toHaveAttribute('href', 'https://ads.google.com/aw/apicenter');
    expect(within(card).getByLabelText(en.fields.developerToken.label)).toHaveAttribute('type', 'password');
    expect(within(card).getByLabelText(en.projectLabel)).toHaveValue('p1');

    fireEvent.change(within(card).getByLabelText(en.fields.customerId.label), { target: { value: 'abc' } });
    fireEvent.click(within(card).getByTestId('connections-google_ads-save'));
    await waitFor(() => expect(within(card).getByLabelText(en.fields.customerId.label)).toHaveAttribute('aria-invalid', 'true'));
    expect(within(card).getByRole('alert')).toHaveTextContent(en.fixFields);

    fireEvent.click(within(card).getByTestId('connections-google_ads-save'));
    expect(await within(card).findByText(en.reasons.developer_token_not_approved)).toBeInTheDocument();

    fireEvent.click(within(card).getByTestId('connections-google_ads-save'));
    expect(await within(card).findByText(en.connected.replace('{account}', 'EasySign Google Ads (4816235600)'), { exact: false })).toBeInTheDocument();
    expect(within(card).getByTestId('connections-return')).toHaveAttribute('href', '/en/orgs/o/projects/p1/ad-studio?step=publish');
    expect(within(card).getByText(en.usedIn.replace('{projects}', 'EasySign'))).toBeInTheDocument();
    const [url, init] = fetchMock.mock.calls[2] as [string, RequestInit];
    expect(url).toBe('/api/orgs/o/connections');
    expect(JSON.parse(String(init.body))).toEqual({ provider: 'google_ads', fields: { customerId: 'abc' }, projectId: 'p1' });
  });

  it('offers Connect with Facebook first, with the manual way folded, in Hebrew', () => {
    renderApp({ metaConnectHref: '/api/integrations/meta/start?orgId=o', focus: 'meta_ads' }, 'he');
    const card = screen.getByTestId('connections-meta_ads');
    expect(within(card).getByTestId('connections-meta-oauth')).toHaveAttribute('href', '/api/integrations/meta/start?orgId=o');
    expect(within(card).queryByLabelText(he.fields.accessToken.label)).toBeNull();
    fireEvent.click(within(card).getByRole('button', { name: he.platforms.meta_ads.manual }));
    expect(within(card).getByLabelText(he.fields.accessToken.label)).toBeInTheDocument();
  });

  it('re-checks a connection and says what went wrong', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json({ check: { status: 'failed', reason: 'auth_failed' }, connection: { ...META_ROW, lastCheckStatus: 'auth_failed' } })));
    renderApp({ connections: [META_ROW] });
    const card = screen.getByTestId('connections-meta_ads');
    fireEvent.click(within(card).getByRole('button', { name: en.checkAgain }));
    expect(await within(card).findByRole('alert')).toHaveTextContent(en.reasons.auth_failed);
    expect(within(card).getByText(en.status.failed)).toBeInTheDocument();
  });

  it('lets a member see the state but not change it', () => {
    renderApp({ canManage: false, connections: [META_ROW] });
    expect(screen.getByRole('note')).toHaveTextContent(en.readOnly);
    expect(screen.queryByRole('button', { name: en.checkAgain })).toBeNull();
    expect(screen.queryByTestId('connections-google_ads-add')).toBeNull();
  });
});
