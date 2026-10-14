import { describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { renderWithIntl } from '@/tests/e2e/helpers/test-harness';
import { BriefForm, normalizeLandingPageUrl } from './brief-form';

const push = vi.fn();
vi.mock('@/i18n/navigation', () => ({ useRouter: () => ({ push, refresh: vi.fn() }) }));

describe('normalizeLandingPageUrl', () => {
  it('adds https:// to a bare address and leaves full links and blanks alone', () => {
    expect(normalizeLandingPageUrl(' mysite.com/offer ')).toBe('https://mysite.com/offer');
    expect(normalizeLandingPageUrl('http://mysite.com')).toBe('http://mysite.com');
    expect(normalizeLandingPageUrl('HTTPS://mysite.com')).toBe('HTTPS://mysite.com');
    expect(normalizeLandingPageUrl('  ')).toBe('');
  });
});

describe('BriefForm for a newcomer', () => {
  it('accepts a bare web address, says so in plain words, and sends it with https://', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ brief: { id: 'b1' } }) });
    vi.stubGlobal('fetch', fetchMock);
    renderWithIntl(<BriefForm orgId="o" projectId="p" studioHref="/ad-studio" />);
    expect(screen.getByText(/we add https:\/\/ for you/i)).toBeTruthy();
    fireEvent.change(screen.getByLabelText(/Ad name/), { target: { value: 'Launch' } });
    fireEvent.change(screen.getByLabelText(/What should the ad achieve/), { target: { value: 'Signups' } });
    fireEvent.change(screen.getByLabelText(/What is being sold/), { target: { value: 'A tool' } });
    fireEvent.change(screen.getByLabelText(/Website page people should open/), { target: { value: 'mysite.com/offer' } });
    fireEvent.submit(screen.getByTestId('ad-studio-brief-create'));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).landingPageUrl).toBe('https://mysite.com/offer');
    await waitFor(() => expect(push).toHaveBeenCalledWith('/ad-studio?brief=b1'));
  });

  it('starts a new ad in the language the person is reading the app in', () => {
    renderWithIntl(<BriefForm orgId="o" projectId="p" studioHref="/ad-studio" />, { locale: 'he' });
    const selects = screen.getAllByRole('combobox') as HTMLSelectElement[];
    expect(selects.some((s) => s.value === 'he')).toBe(true);
  });
});
