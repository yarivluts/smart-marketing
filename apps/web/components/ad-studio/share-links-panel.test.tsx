import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import React from 'react';
import { renderWithIntl } from '@/tests/e2e/helpers/test-harness';
import heMessages from '@/messages/he.json';
import { ShareLinksPanel, shareUrl, type ShareLinkRow } from './share-links-panel';

const TOKEN = 'A'.repeat(43);
const API = '/api/orgs/o/projects/p/ad-studio/share-links';
const BRIEFS = [
  { id: 'b1', name: 'Spring sale' },
  { id: 'b2', name: 'New clinic' },
];

const row = (extra: Partial<ShareLinkRow> = {}): ShareLinkRow => ({
  id: 'h1',
  briefIds: null,
  label: 'Dana',
  createdOn: '2026-11-01T10:00:00.000Z',
  expiresOn: '2026-12-01T10:00:00.000Z',
  revokedOn: null,
  status: 'active',
  ...extra,
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('ShareLinksPanel', () => {
  it('makes a link for one ad, shows its address once to copy, and adds it to the list', async () => {
    const fetchMock = vi.fn(async () => json({ token: TOKEN, link: row({ id: 'h2', briefIds: ['b2'], label: 'Client' }) }, 201));
    vi.stubGlobal('fetch', fetchMock);
    const writeText = vi.fn(async () => undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    renderWithIntl(<ShareLinksPanel orgId="o" projectId="p" briefs={BRIEFS} initialLinks={[]} />);

    expect(screen.getByText('No links yet.')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('What to share'), { target: { value: 'b2' } });
    fireEvent.change(screen.getByLabelText('For whom (optional)'), { target: { value: 'Client' } });
    fireEvent.change(screen.getByLabelText('Link works for'), { target: { value: '7' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create link' }));

    const created = await screen.findByTestId('ad-share-created');
    expect(fetchMock).toHaveBeenCalledWith(API, expect.objectContaining({ method: 'POST' }));
    expect(JSON.parse(String(((fetchMock.mock.calls[0] as unknown[])[1] as RequestInit).body))).toEqual({ briefIds: ['b2'], label: 'Client', expiresInDays: 7 });
    const address = within(created).getByLabelText('Share link') as HTMLInputElement;
    expect(address.value).toBe(shareUrl(window.location.origin, 'en', TOKEN));
    fireEvent.click(within(created).getByRole('button', { name: 'Copy link' }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(address.value));
    expect(await within(created).findByRole('button', { name: 'Copied' })).toBeInTheDocument();

    const rows = screen.getAllByTestId('ad-share-link-row');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toHaveTextContent('Client');
    expect(rows[0]).toHaveTextContent('New clinic');
    expect(rows[0]).toHaveTextContent('Active');
  });

  it('shares all ads by default, or the one ad of the shortcut', async () => {
    const fetchMock = vi.fn(async () => json({ token: TOKEN, link: row() }, 201));
    vi.stubGlobal('fetch', fetchMock);
    const { unmount } = renderWithIntl(<ShareLinksPanel orgId="o" projectId="p" briefs={BRIEFS} initialLinks={[]} />);
    fireEvent.click(screen.getByRole('button', { name: 'Create link' }));
    await screen.findByTestId('ad-share-created');
    expect(JSON.parse(String(((fetchMock.mock.calls[0] as unknown[])[1] as RequestInit).body))).toEqual({ briefIds: null, label: '', expiresInDays: 30 });
    unmount();

    renderWithIntl(<ShareLinksPanel orgId="o" projectId="p" briefs={[BRIEFS[0]]} initialLinks={[]} defaultBriefId="b1" />);
    fireEvent.click(screen.getByRole('button', { name: 'Create link' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(JSON.parse(String(((fetchMock.mock.calls[1] as unknown[])[1] as RequestInit).body))).toMatchObject({ briefIds: ['b1'] });
  });

  it('turns a link off after a confirmation; expired and turned-off links cannot be turned off again', async () => {
    const fetchMock = vi.fn(async () => json({ link: row({ status: 'revoked', revokedOn: '2026-11-06T10:00:00.000Z' }) }));
    vi.stubGlobal('fetch', fetchMock);
    renderWithIntl(<ShareLinksPanel orgId="o" projectId="p" briefs={BRIEFS} initialLinks={[row(), row({ id: 'h9', label: '', status: 'expired' })]} />);

    const [active, expired] = screen.getAllByTestId('ad-share-link-row');
    expect(within(expired).queryByRole('button', { name: 'Turn off' })).toBeNull();
    expect(expired).toHaveTextContent('Link without a name');
    expect(expired).toHaveTextContent('Expired');

    fireEvent.click(within(active).getByRole('button', { name: 'Turn off' }));
    expect(within(active).getByRole('alertdialog')).toBeInTheDocument();
    fireEvent.click(within(active).getByRole('button', { name: 'Turn off' }));
    await waitFor(() => expect(within(active).getByText('Turned off')).toBeInTheDocument());
    expect(fetchMock).toHaveBeenCalledWith(`${API}/h1`, { method: 'DELETE' });
  });

  it('says so when the link could not be made', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json({ error: 'forbidden' }, 403)));
    renderWithIntl(<ShareLinksPanel orgId="o" projectId="p" briefs={BRIEFS} initialLinks={[]} />);
    fireEvent.click(screen.getByRole('button', { name: 'Create link' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Something went wrong');
    expect(screen.queryByTestId('ad-share-created')).toBeNull();
  });

  it('reads in Hebrew and builds a Hebrew address', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json({ token: TOKEN, link: row() }, 201)));
    renderWithIntl(<ShareLinksPanel orgId="o" projectId="p" briefs={BRIEFS} initialLinks={[]} />, { locale: 'he' });
    expect(screen.getByRole('heading', { name: heMessages.AdShare.manage.title })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: heMessages.AdShare.manage.create }));
    const address = (await screen.findByLabelText(heMessages.AdShare.manage.linkLabel)) as HTMLInputElement;
    expect(address.value).toContain(`/he/share/ads/${TOKEN}`);
    expect(address).toHaveAttribute('dir', 'ltr');
  });
});
