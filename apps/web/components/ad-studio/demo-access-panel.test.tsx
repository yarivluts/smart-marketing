import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import React from 'react';
import type { AdStudioDemoRecordingView } from '@growthos/shared';
import { renderWithIntl } from '@/tests/e2e/helpers/test-harness';
import { DemoAccessPanel } from './demo-access-panel';

vi.mock('@/i18n/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));

afterEach(() => vi.unstubAllGlobals());

const READY: AdStudioDemoRecordingView = {
  id: 'r1',
  status: 'ready',
  failureCode: null,
  durationSeconds: 20,
  site: 'app.example.com',
  requestedOn: '2026-11-01T10:00:00.000Z',
  completedOn: '2026-11-01T10:02:00.000Z',
  segments: [
    { id: 'a', startSeconds: 0, endSeconds: 4, title: 'Dashboard', description: 'The overview', selected: true },
    { id: 'b', startSeconds: 4, endSeconds: 9, title: 'Reports', description: 'A report', selected: false },
  ],
};

describe('DemoAccessPanel', () => {
  it('asks a project admin for trial access plainly and saves it with a write-only password', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ demoAccess: { loginUrl: 'https://app.example.com/login', username: 'trial@example.com', hasPassword: true, notes: '', lastChangedOn: null } }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    renderWithIntl(<DemoAccessPanel orgId="o" projectId="p" access={null} canEdit recordings={[]} recordingAvailable />, { locale: 'en' });
    expect(screen.getByText('Trial account access')).toBeInTheDocument();
    expect(screen.getByText('Use a trial or demo account - never your own admin account.')).toBeInTheDocument();
    expect(screen.getByText('The password is stored encrypted and is never shown again.')).toBeInTheDocument();
    const password = screen.getByLabelText('Password');
    expect(password).toHaveAttribute('type', 'password');
    expect(password).toHaveAttribute('autocomplete', 'new-password');

    fireEvent.change(screen.getByLabelText('App login address'), { target: { value: 'https://app.example.com/login' } });
    fireEvent.change(screen.getByLabelText('Username or email'), { target: { value: 'trial@example.com' } });
    fireEvent.change(password, { target: { value: 'secret-pass' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save trial access' }));
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Trial access saved.'));
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/orgs/o/projects/p/ad-studio/demo-access');
    expect(JSON.parse(String(init.body)).demoAccess).toEqual({ loginUrl: 'https://app.example.com/login', username: 'trial@example.com', password: 'secret-pass', notes: '' });
    // The typed password is cleared from the page once saved.
    expect(password).toHaveValue('');
    // Recording needs the access to exist (the page refresh brings it).
    expect(screen.getByRole('button', { name: 'Record a usage video' })).toBeDisabled();
  });

  it('points at the field the server refused', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error: 'invalid_demo_access', fields: ['login_url'] }), { status: 400 })));
    renderWithIntl(<DemoAccessPanel orgId="o" projectId="p" access={null} canEdit recordings={[]} recordingAvailable />, { locale: 'en' });
    fireEvent.change(screen.getByLabelText('App login address'), { target: { value: 'https://10.0.0.1/' } });
    fireEvent.change(screen.getByLabelText('Username or email'), { target: { value: 'x' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'y' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save trial access' }));
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent("Enter the public https address of your app's login page."));
  });

  it('is read-only without project.configure and never shows a username', () => {
    renderWithIntl(
      <DemoAccessPanel orgId="o" projectId="p" access={{ loginUrl: 'https://app.example.com/login', username: null, hasPassword: true, notes: '', lastChangedOn: null }} canEdit={false} recordings={[]} recordingAvailable />,
      { locale: 'en' },
    );
    expect(screen.queryByLabelText('Password')).toBeNull();
    expect(screen.getByText('Trial access is set for app.example.com.')).toBeInTheDocument();
    expect(screen.getByText('Only a project admin can change the trial access.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Record a usage video' })).toBeEnabled();
  });

  it('records, then shows the video and lets people choose the moments used in ads', async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === 'POST') return new Response(JSON.stringify({ recording: READY }), { status: 201 });
      const ids = JSON.parse(String(init?.body)).selectedSegmentIds as string[];
      return new Response(JSON.stringify({ recording: { ...READY, segments: READY.segments.map((segment) => ({ ...segment, selected: ids.includes(segment.id) })) } }), { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);
    const access = { loginUrl: 'https://app.example.com/login', username: 'trial@example.com', hasPassword: true, notes: '', lastChangedOn: null };
    const { container } = renderWithIntl(<DemoAccessPanel orgId="o" projectId="p" access={access} canEdit recordings={[]} recordingAvailable />, { locale: 'en' });
    expect(screen.getByText("Takes 1-2 minutes and uses up to 9 AI text calls from today's limit.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Record a usage video' }));
    await waitFor(() => expect(container.querySelector('video')).not.toBeNull());
    expect(container.querySelector('video')?.getAttribute('src')).toBe('/api/orgs/o/projects/p/ad-studio/demo-recordings/r1/media');
    // The password field never shows the stored password.
    expect(screen.getByLabelText('Password')).toHaveValue('');

    fireEvent.click(screen.getByRole('checkbox', { name: 'Use in ads: Reports' }));
    await waitFor(() => expect(screen.getByRole('checkbox', { name: 'Use in ads: Reports' })).toBeChecked());
    const [url, init] = fetchMock.mock.calls[1] as unknown as [string, RequestInit];
    expect(url).toBe('/api/orgs/o/projects/p/ad-studio/demo-recordings/r1');
    expect(JSON.parse(String(init.body))).toEqual({ selectedSegmentIds: ['a', 'b'] });
  });

  it('explains why the last recording failed', () => {
    renderWithIntl(
      <DemoAccessPanel orgId="o" projectId="p" access={null} canEdit={false} recordings={[{ ...READY, id: 'r2', status: 'failed', failureCode: 'login_failed', segments: [] }]} recordingAvailable />,
      { locale: 'en' },
    );
    expect(screen.getByTestId('ad-studio-demo-failed')).toHaveTextContent('The last recording failed: signing in did not work - check the username and password.');
  });
});
