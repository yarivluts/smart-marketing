import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { renderWithIntl } from '@/tests/e2e/helpers/test-harness';
import enMessages from '@/messages/en.json';
import heMessages from '@/messages/he.json';
import { BriefForm, defaultAdName } from './brief-form';

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

describe('BriefForm ad name hint', () => {
  it('shows an example for the name so a newcomer knows what to type, in both languages', () => {
    const { unmount } = renderWithIntl(<BriefForm orgId="o" projectId="p" />, { locale: 'en' });
    expect(screen.getByLabelText(enMessages.AdStudio.fieldName)).toHaveAttribute('placeholder', enMessages.AdStudio.fieldNameHintNew);
    unmount();
    renderWithIntl(<BriefForm orgId="o" projectId="p" />, { locale: 'he' });
    expect(screen.getByLabelText(heMessages.AdStudio.fieldName)).toHaveAttribute('placeholder', heMessages.AdStudio.fieldNameHintNew);
  });

  it('does not ask a newcomer to name a new ad, but still requires the name when editing', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ brief: { id: 'b9' } }), { status: 201 }));
    vi.stubGlobal('fetch', fetchMock);
    const { container, unmount } = renderWithIntl(<BriefForm orgId="o" projectId="p" studioHref="/s" />, { locale: 'en' });
    expect(screen.getByLabelText(enMessages.AdStudio.fieldName)).not.toBeRequired();
    for (const el of container.querySelectorAll('input[required], textarea[required]')) fireEvent.change(el, { target: { value: 'Accounting app for freelancers' } });
    fireEvent.click(screen.getByRole('button', { name: enMessages.AdStudio.createButton }));
    await waitFor(() => expect(push).toHaveBeenCalledWith('/s?brief=b9'));
    expect(JSON.parse(String((fetchMock.mock.calls[0] as [string, RequestInit])[1].body)).name).toBe('Accounting app for freelancers');
    unmount();
    renderWithIntl(
      <BriefForm orgId="o" projectId="p" briefId="b" initial={{ name: 'n', objective: 'o', productDescription: 'd', landingPageUrl: '', format: 'vertical', language: 'en', targetSeconds: 30 }} />,
      { locale: 'en' },
    );
    expect(screen.getByLabelText(enMessages.AdStudio.fieldName)).toBeRequired();
  });

  it('names an ad after what it sells, shortened, falling back to the goal', () => {
    expect(defaultAdName('  Accounting\n app  ', 'x')).toBe('Accounting app');
    expect(defaultAdName('', 'More signups')).toBe('More signups');
    expect(defaultAdName('a'.repeat(80), '')).toHaveLength(60);
    expect(defaultAdName('a'.repeat(80), '').endsWith('...')).toBe(true);
  });

  it('accepts a web address typed without https:// instead of blocking the form', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ brief: { id: 'b2' } }), { status: 201 }));
    vi.stubGlobal('fetch', fetchMock);
    const { container } = renderWithIntl(<BriefForm orgId="o" projectId="p" studioHref="/s" />, { locale: 'en' });
    for (const el of container.querySelectorAll('input[required], textarea[required]')) fireEvent.change(el, { target: { value: 'x' } });
    const site = screen.getByLabelText(enMessages.AdStudio.fieldLandingPage);
    expect(site).toHaveAttribute('type', 'text');
    expect(site).toHaveAttribute('inputmode', 'url');
    expect(site).toHaveAttribute('autocapitalize', 'off');
    fireEvent.change(site, { target: { value: ' my-shop.com/sale ' } });
    fireEvent.click(screen.getByRole('button', { name: enMessages.AdStudio.createButton }));
    await waitFor(() => expect(push).toHaveBeenCalledWith('/s?brief=b2'));
    expect(JSON.parse(String((fetchMock.mock.calls[0] as [string, RequestInit])[1].body)).landingPageUrl).toBe('https://my-shop.com/sale');
  });

  it('keeps an address that already has a scheme, and an empty one empty', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ brief: { id: 'b3' } }), { status: 201 }));
    vi.stubGlobal('fetch', fetchMock);
    const { container } = renderWithIntl(<BriefForm orgId="o" projectId="p" studioHref="/s" />, { locale: 'en' });
    for (const el of container.querySelectorAll('input[required], textarea[required]')) fireEvent.change(el, { target: { value: 'x' } });
    fireEvent.click(screen.getByRole('button', { name: enMessages.AdStudio.createButton }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(JSON.parse(String((fetchMock.mock.calls[0] as [string, RequestInit])[1].body)).landingPageUrl).toBe('');
  });
});

describe('BriefForm video length hint', () => {
  it('tells a newcomer what length to pick, in both languages', () => {
    const { unmount } = renderWithIntl(<BriefForm orgId="o" projectId="p" />, { locale: 'en' });
    expect(screen.getByLabelText(new RegExp(enMessages.AdStudio.fieldLength.replace(/[()]/g, '\\$&')))).toHaveAccessibleDescription(enMessages.AdStudio.fieldLengthHint);
    unmount();
    renderWithIntl(<BriefForm orgId="o" projectId="p" />, { locale: 'he' });
    expect(screen.getByLabelText(new RegExp(heMessages.AdStudio.fieldLength.replace(/[()]/g, '\\$&')))).toHaveAccessibleDescription(heMessages.AdStudio.fieldLengthHint);
  });
});
