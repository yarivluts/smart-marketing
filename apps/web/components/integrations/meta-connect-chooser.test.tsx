import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { renderWithIntl } from '@/tests/e2e/helpers/test-harness';
import heMessages from '@/messages/he.json';
import { MetaConnectChooser } from './meta-connect-chooser';

const ACCOUNTS = [
  { id: '58689695', name: 'Easy Event', currency: 'ILS', status: 2 },
  { id: '1646897415410557', name: 'Yariv Luts', currency: 'ILS', status: 1 },
];
const PAGES = [{ id: '1253606311170957', name: 'EasySign' }];

function renderChooser(props: Partial<React.ComponentProps<typeof MetaConnectChooser>> = {}, locale: 'en' | 'he' = 'en') {
  return renderWithIntl(
    <MetaConnectChooser
      locale={locale}
      orgId="o1"
      session="s1"
      adAccounts={ACCOUNTS}
      pages={PAGES}
      projects={[{ id: 'p1', name: 'Website' }]}
      defaultProjectId="p1"
      returnTo="/en/orgs/o1/projects/p1/ad-studio?brief=b1&step=publish"
      tokenExpiresOn="2026-11-28T20:00:00.000Z"
      {...props}
    />,
    { locale },
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('MetaConnectChooser', () => {
  it('preselects the active ad account, sends the pick, and returns to where the person started', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ credentialId: 'c1', returnTo: '/en/orgs/o1/projects/p1/ad-studio?brief=b1&step=publish' }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const assign = vi.fn();
    vi.stubGlobal('location', { ...window.location, assign });
    renderChooser();

    expect(screen.getByRole('radio', { name: /Yariv Luts/ })).toBeChecked();
    expect(screen.getByText('not active')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Connect' }));

    await waitFor(() => expect(assign).toHaveBeenCalledWith('/en/orgs/o1/projects/p1/ad-studio?brief=b1&step=publish'));
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/orgs/o1/integrations/meta/finish');
    expect(JSON.parse(init.body as string)).toEqual({ session: 's1', adAccountId: '1646897415410557', pageId: '1253606311170957', projectId: 'p1' });
  });

  it('shows why a connection failed, and without a way back, says it is connected', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ error: 'session_expired' }), { status: 409 })).mockResolvedValue(new Response(JSON.stringify({ credentialId: 'c1', returnTo: null }), { status: 200 })));
    renderChooser({ returnTo: null });
    fireEvent.click(screen.getByRole('button', { name: 'Connect' }));
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('This connection attempt expired. Start again.'));
    fireEvent.click(screen.getByRole('button', { name: 'Connect' }));
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Connected.'));
    expect(screen.getByRole('link', { name: 'Open the project resources' })).toHaveAttribute('href', '/en/orgs/o1/projects/p1/resources');
  });

  it('works in Hebrew and cannot be sent without a Page', () => {
    renderChooser({ pages: [] }, 'he');
    expect(screen.getByText(heMessages.MetaConnect.noPages)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: heMessages.MetaConnect.save })).toBeDisabled();
  });
});
