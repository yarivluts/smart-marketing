import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import React from 'react';
import { renderWithIntl } from '@/tests/e2e/helpers/test-harness';
import { OperatorPilots, type OperatorPilotRow } from './operator-pilots';

vi.mock('@/i18n/navigation', () => ({
  Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

afterEach(() => vi.unstubAllGlobals());

const ROWS: OperatorPilotRow[] = [
  { organizationId: 'o1', organizationName: 'EasySign', projectId: 'p1', siteUrl: 'https://easy-sign.co.il/', status: 'active', lastRunOn: '2026-10-14T09:00:00Z', lastRunOutcome: 'worked' },
  { organizationId: 'o2', organizationName: 'Other', projectId: 'p2', siteUrl: 'https://www.other.co.il/', status: 'failed', lastRunOn: null, lastRunOutcome: null },
];

describe('OperatorPilots', () => {
  it('lists every pilot with its site, organization, status and last run, and links into it', () => {
    renderWithIntl(<OperatorPilots rows={ROWS} />, { locale: 'en' });
    const [first, second] = screen.getAllByTestId('operator-pilot-row');
    expect(first).toHaveTextContent('easy-sign.co.il');
    expect(first).toHaveTextContent('EasySign');
    expect(first).toHaveTextContent('Active');
    expect(first).toHaveTextContent('worked');
    expect(within(first).getByRole('link')).toHaveAttribute('href', '/orgs/o1/projects/p1/growth-pilot');
    expect(second).toHaveTextContent('other.co.il');
    expect(second).toHaveTextContent('Not yet');
    expect(within(second).queryByTestId('operator-pilot-toggle')).toBeNull();
  });

  it('pauses a pilot and shows its new status', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ status: 'paused' })));
    vi.stubGlobal('fetch', fetchMock);
    renderWithIntl(<OperatorPilots rows={ROWS} />, { locale: 'en' });
    fireEvent.click(screen.getByTestId('operator-pilot-toggle'));
    await waitFor(() => expect(screen.getAllByTestId('operator-pilot-row')[0]).toHaveTextContent('Paused'));
    expect(JSON.parse((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body as string)).toEqual({ organizationId: 'o1', projectId: 'p1', paused: true });
    expect(screen.getByTestId('operator-pilot-toggle')).toHaveTextContent('Resume');
  });

  it('says so when there are no pilots', () => {
    renderWithIntl(<OperatorPilots rows={[]} />, { locale: 'en' });
    expect(screen.getByText('No pilots yet.')).toBeInTheDocument();
  });
});
