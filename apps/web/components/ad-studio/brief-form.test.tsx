import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { renderWithIntl } from '@/tests/e2e/helpers/test-harness';
import enMessages from '@/messages/en.json';
import heMessages from '@/messages/he.json';
import { BriefForm } from './brief-form';

const push = vi.fn();
vi.mock('@/i18n/navigation', () => ({ useRouter: () => ({ push, refresh: vi.fn() }) }));

afterEach(() => {
  vi.unstubAllGlobals();
  push.mockReset();
});

describe('BriefForm ad language default', () => {
  it('starts a new ad in Hebrew for someone reading GrowthOS in Hebrew', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ brief: { id: 'b1' } }), { status: 201 }));
    vi.stubGlobal('fetch', fetchMock);
    const { container } = renderWithIntl(<BriefForm orgId="o" projectId="p" studioHref="/s" />, { locale: 'he' });
    expect(screen.getByLabelText(heMessages.AdStudio.fieldLanguage)).toHaveValue('he');
    for (const el of container.querySelectorAll('input[required], textarea[required]')) fireEvent.change(el, { target: { value: 'x' } });
    fireEvent.click(screen.getByRole('button', { name: heMessages.AdStudio.createButton }));
    await waitFor(() => expect(push).toHaveBeenCalledWith('/s?brief=b1'));
    expect(JSON.parse(String((fetchMock.mock.calls[0] as [string, RequestInit])[1].body)).language).toBe('he');
  });

  it('starts in English for English readers, and keeps the saved language when editing', () => {
    const { unmount } = renderWithIntl(<BriefForm orgId="o" projectId="p" />, { locale: 'en' });
    expect(screen.getByLabelText(enMessages.AdStudio.fieldLanguage)).toHaveValue('en');
    unmount();
    renderWithIntl(
      <BriefForm orgId="o" projectId="p" briefId="b" initial={{ name: 'n', objective: 'o', productDescription: 'd', landingPageUrl: '', format: 'vertical', language: 'en', targetSeconds: 30 }} />,
      { locale: 'he' },
    );
    expect(screen.getByLabelText(heMessages.AdStudio.fieldLanguage)).toHaveValue('en');
  });
});

describe('BriefForm video shape label', () => {
  it('names the shape field in plain words with its hint, in both languages', () => {
    const { unmount } = renderWithIntl(<BriefForm orgId="o" projectId="p" />, { locale: 'en' });
    expect(enMessages.AdStudio.fieldFormat).toBe('Video shape');
    expect(screen.getByLabelText(new RegExp(enMessages.AdStudio.fieldFormat))).toHaveAccessibleDescription(enMessages.AdStudio.formatVerticalHint);
    unmount();
    renderWithIntl(<BriefForm orgId="o" projectId="p" />, { locale: 'he' });
    expect(screen.getByLabelText(new RegExp(heMessages.AdStudio.fieldFormat))).toBeInTheDocument();
  });
});
