import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import React from 'react';
import { renderWithIntl } from '@/tests/e2e/helpers/test-harness';
import heMessages from '@/messages/he.json';
import { ExportPanel, type ExportRow } from './export-panel';

const refresh = vi.fn();
vi.mock('@/i18n/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh }),
  Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

const CONNECTED = { available: true as const, credentialName: 'EasySign Meta' };
const NOT_ATTACHED = { available: false as const, reason: 'not_attached' as const };

function renderPanel(props: Partial<React.ComponentProps<typeof ExportPanel>> = {}, locale: 'en' | 'he' = 'en') {
  return renderWithIntl(
    <ExportPanel
      orgId="o"
      projectId="p"
      briefId="b1"
      video={{ id: 'v1', durationSeconds: 29.6 }}
      destinations={{ meta: CONNECTED, youtube: NOT_ATTACHED }}
      exports={[]}
      canExport
      defaultTitle="Sign in 30 seconds"
      defaultDescription="For lawyers"
      resourcesHref="/orgs/o/projects/p/resources"
      {...props}
    />,
    { locale },
  );
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

afterEach(() => {
  vi.unstubAllGlobals();
  refresh.mockReset();
});

describe('ExportPanel', () => {
  it('exports to a connected destination with the edited title and reports the upload', async () => {
    const fetchMock = vi.fn(async () => json({ export: { status: 'done' } }, 201));
    vi.stubGlobal('fetch', fetchMock);
    renderPanel();

    expect(screen.getByText('Send the finished 30-second video to your Meta ad account or your YouTube channel.')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Video title'), { target: { value: 'Signed before lunch' } });
    fireEvent.click(within(screen.getByTestId('ad-studio-export-meta')).getByRole('button'));

    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Uploaded to Facebook and Instagram.'));
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/orgs/o/projects/p/ad-studio/briefs/b1/export');
    expect(JSON.parse(init.body as string)).toEqual({ videoId: 'v1', destination: 'meta', title: 'Signed before lunch', description: 'For lawyers' });
    expect(refresh).toHaveBeenCalled();
  });

  it('explains an unconnected destination, links to project resources, and disables its button', () => {
    renderPanel();
    const youtube = screen.getByTestId('ad-studio-export-youtube');
    expect(youtube).toHaveTextContent('No connection is attached to this project.');
    expect(within(youtube).getByRole('link', { name: 'Open project resources' })).toHaveAttribute('href', '/orgs/o/projects/p/resources');
    expect(within(youtube).getByRole('button')).toBeDisabled();
    expect(within(youtube).queryByLabelText('Visibility on YouTube')).toBeNull();
  });

  it('sends the chosen YouTube visibility and shows the failure reason the platform returned', async () => {
    const fetchMock = vi.fn(async () => json({ export: { status: 'failed', failureCode: 'quota_exceeded' } }, 502));
    vi.stubGlobal('fetch', fetchMock);
    renderPanel({ destinations: { meta: CONNECTED, youtube: { available: true, credentialName: 'Channel' } } });

    const youtube = screen.getByTestId('ad-studio-export-youtube');
    fireEvent.change(within(youtube).getByLabelText('Visibility on YouTube'), { target: { value: 'private' } });
    fireEvent.click(within(youtube).getByRole('button'));

    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('The platform upload quota is used up for today.'));
    expect(JSON.parse((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body as string)).toMatchObject({ destination: 'youtube', privacy: 'private' });
  });

  it('blocks exporting without a video or without permission', () => {
    const { unmount } = renderPanel({ video: null });
    expect(screen.getByText('Assemble the video first. Only the current finished video can be exported.')).toBeInTheDocument();
    expect(within(screen.getByTestId('ad-studio-export-meta')).getByRole('button')).toBeDisabled();
    unmount();

    renderPanel({ canExport: false });
    expect(within(screen.getByTestId('ad-studio-export-meta')).getByRole('button')).toBeDisabled();
    expect(screen.getByText('Exporting needs permission to make changes on the ad platforms. Ask a project admin.')).toBeInTheDocument();
  });

  it('lists past exports with status, visibility and a link to the uploaded video, in Hebrew', () => {
    const rows: ExportRow[] = [
      { id: 'e1', destination: 'youtube', title: 'Ad one', privacy: 'unlisted', status: 'done', externalUrl: 'https://www.youtube.com/watch?v=abc', failureCode: null, requestedOn: '2026-09-28T08:00:00.000Z' },
      { id: 'e2', destination: 'meta', title: 'Ad two', privacy: null, status: 'failed', externalUrl: null, failureCode: 'auth_failed', requestedOn: '2026-09-28T09:00:00.000Z' },
    ];
    renderPanel({ exports: rows }, 'he');
    const [first, second] = screen.getAllByTestId('ad-studio-export-row');
    expect(first).toHaveTextContent(heMessages.AdStudio.exportStatus.done);
    expect(first).toHaveTextContent(heMessages.AdStudio.exportPrivacyShort.unlisted);
    // Dates follow the page locale, not the browser's default.
    expect(first).toHaveTextContent(new Intl.DateTimeFormat('he', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(rows[0].requestedOn)));
    expect(within(first).getByRole('link', { name: heMessages.AdStudio.exportOpen })).toHaveAttribute('href', 'https://www.youtube.com/watch?v=abc');
    expect(second).toHaveTextContent(heMessages.AdStudio.exportFailure.auth_failed);
    expect(within(second).queryByRole('link')).toBeNull();
  });
});
