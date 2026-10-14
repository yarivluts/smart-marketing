import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { renderWithIntl } from '@/tests/e2e/helpers/test-harness';
import enMessages from '@/messages/en.json';
import heMessages from '@/messages/he.json';
import { AdFromSite, fromSiteReason } from './ad-from-site';

const push = vi.fn();
vi.mock('@/i18n/navigation', () => ({ useRouter: () => ({ push, refresh: vi.fn() }) }));

const en = enMessages.AdStudio.fromSite;
const he = heMessages.AdStudio.fromSite;

afterEach(() => {
  vi.unstubAllGlobals();
  push.mockReset();
});

describe('AdFromSite', () => {
  it('starts from the site the project already advertises and opens the new ad on its plan', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ brief: { id: 'b9' }, run: { status: 'running' } }), { status: 201 }));
    vi.stubGlobal('fetch', fetchMock);
    renderWithIntl(<AdFromSite orgId="o" projectId="p" studioHref="/orgs/o/projects/p/ad-studio" defaultSiteUrl="https://easy-sign.co.il/" />, { locale: 'he' });
    expect(screen.getByLabelText(he.label)).toHaveValue('https://easy-sign.co.il/');
    fireEvent.click(screen.getByRole('button', { name: he.submit }));
    expect(await screen.findByRole('status')).toHaveTextContent(he.working);
    await waitFor(() => expect(push).toHaveBeenCalledWith('/orgs/o/projects/p/ad-studio?brief=b9&step=plan'));
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/orgs/o/projects/p/ad-studio/briefs/from-site');
    expect(JSON.parse(String(init.body))).toEqual({ siteUrl: 'https://easy-sign.co.il/' });
  });

  it('asks for a site before calling anyone, and explains a site that cannot be used', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: 'site', reason: 'nothing_found' }), { status: 422 }));
    vi.stubGlobal('fetch', fetchMock);
    renderWithIntl(<AdFromSite orgId="o" projectId="p" studioHref="/s" defaultSiteUrl={null} />, { locale: 'en' });
    fireEvent.click(screen.getByRole('button', { name: en.submit }));
    expect(screen.getByRole('alert')).toHaveTextContent(en.reasons.invalid_url);
    expect(fetchMock).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText(en.label), { target: { value: 'easysign.co.il' } });
    fireEvent.click(screen.getByRole('button', { name: en.submit }));
    expect(await screen.findByRole('alert')).toHaveTextContent(en.reasons.nothing_found);
    expect(push).not.toHaveBeenCalled();
  });

  it('turns every engine reason into one a person can act on', () => {
    expect(fromSiteReason('site_blocked_url')).toBe('blocked');
    expect(fromSiteReason('site_empty_page')).toBe('unreadable');
    expect(fromSiteReason('site_not_html')).toBe('unreadable');
    expect(fromSiteReason('site_timeout')).toBe('unreachable');
    expect(fromSiteReason('site_http_error')).toBe('unreachable');
    expect(fromSiteReason('site_no_url')).toBe('invalid_url');
    expect(fromSiteReason(undefined)).toBe('unreachable');
  });
});
