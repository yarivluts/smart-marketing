import { fireEvent, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { describe, expect, it, vi } from 'vitest';
import en from '../../messages/en.json';
import he from '../../messages/he.json';

vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn() }));
vi.mock('@/i18n/navigation', () => ({
  Link: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

import * as Sentry from '@sentry/nextjs';
import LocaleError from './error';
import LocaleNotFound from './not-found';

function wrap(locale: 'en' | 'he', ui: React.ReactElement): React.ReactElement {
  return (
    <NextIntlClientProvider locale={locale} messages={locale === 'en' ? en : he}>
      {ui}
    </NextIntlClientProvider>
  );
}

describe('LocaleError', () => {
  it('apologises in plain words, reports the error and offers retry and a way home', () => {
    const error = new Error('boom');
    const reset = vi.fn();
    render(wrap('en', <LocaleError error={error} reset={reset} />));

    expect(screen.getByRole('heading', { name: en.ErrorPage.title })).toBeTruthy();
    expect(Sentry.captureException).toHaveBeenCalledWith(error);
    fireEvent.click(screen.getByRole('button', { name: en.ErrorPage.retry }));
    expect(reset).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('link', { name: en.ErrorPage.home }).getAttribute('href')).toBe('/');
  });

  it('speaks Hebrew in the Hebrew app', () => {
    render(wrap('he', <LocaleError error={new Error('boom')} reset={vi.fn()} />));
    expect(screen.getByRole('heading', { name: he.ErrorPage.title })).toBeTruthy();
  });
});

describe('LocaleNotFound', () => {
  it('explains the missing page and links back to the start', () => {
    render(wrap('en', <LocaleNotFound />));
    expect(screen.getByRole('heading', { name: en.ErrorPage.notFoundTitle })).toBeTruthy();
    expect(screen.getByRole('link', { name: en.ErrorPage.home }).getAttribute('href')).toBe('/');
  });
});

describe('ErrorPage copy', () => {
  it('has the same keys in both languages, and the Hebrew is Hebrew', () => {
    expect(Object.keys(he.ErrorPage)).toEqual(Object.keys(en.ErrorPage));
    for (const value of Object.values(he.ErrorPage)) expect(value).toMatch(/[֐-׿]/);
  });
});
