import { render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextIntlClientProvider } from 'next-intl';
import enMessages from '../../messages/en.json';
import heMessages from '../../messages/he.json';
import HomePage, { generateMetadata } from './page';

const { session } = vi.hoisted(() => ({ session: vi.fn() }));
vi.mock('next-intl/server', () => ({
  setRequestLocale: vi.fn(),
  getTranslations: vi.fn(async ({ locale }: { locale: string }) => (key: string) => (locale === 'he' ? heMessages : enMessages).HomePage[key as 'metaTitle']),
}));
vi.mock('@/lib/auth/get-server-session', () => ({ getServerSession: session }));
vi.mock('@/components/locale-switcher', () => ({ LocaleSwitcher: () => <span>language</span> }));
vi.mock('@/i18n/navigation', () => ({
  Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

afterEach(() => session.mockReset());

async function renderHome(locale: 'en' | 'he', signedIn = false) {
  session.mockResolvedValue(signedIn ? { uid: 'u1' } : null);
  render(
    <NextIntlClientProvider locale={locale} messages={locale === 'he' ? heMessages : enMessages}>
      {await HomePage({ params: Promise.resolve({ locale }) })}
    </NextIntlClientProvider>,
  );
}

describe('HomePage', () => {
  it('says what GrowthOS does and how, and offers a way in', async () => {
    await renderHome('en');
    const en = enMessages.HomePage;
    expect(screen.getByRole('heading', { level: 1, name: en.title })).toBeInTheDocument();
    for (const heading of [en.howTitle, en.featuresTitle, en.controlTitle, en.faqTitle, en.ctaTitle]) {
      expect(screen.getByRole('heading', { level: 2, name: heading })).toBeInTheDocument();
    }
    expect(screen.getByText(en.step3Title)).toBeInTheDocument();
    expect(screen.getByText(en.feature.pilot.title)).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: en.startFree })[0]).toHaveAttribute('href', '/signup');
    expect(screen.getByTestId('home-login')).toHaveAttribute('href', '/login');
    expect(within(screen.getByRole('navigation', { name: en.navLabel })).getByRole('link', { name: en.navHow })).toHaveAttribute('href', '#how');
    expect(within(screen.getByTestId('home-faq-developers')).getByRole('link', { name: en.faq.developers.link })).toHaveAttribute('href', '/developers');
    expect(screen.getByRole('link', { name: en.footerPrivacy })).toHaveAttribute('href', '/privacy');
  });

  it('offers a signed-in visitor their account instead of sign-up, in Hebrew', async () => {
    await renderHome('he', true);
    const he = heMessages.HomePage;
    expect(screen.getByRole('heading', { level: 1, name: he.title })).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: he.goToAccount })[0]).toHaveAttribute('href', '/start');
    expect(screen.queryByRole('link', { name: he.startFree })).toBeNull();
  });

  it('still renders for a visitor whose session cannot be read', async () => {
    session.mockRejectedValue(new Error('no admin'));
    render(
      <NextIntlClientProvider locale="en" messages={enMessages}>
        {await HomePage({ params: Promise.resolve({ locale: 'en' }) })}
      </NextIntlClientProvider>,
    );
    expect(screen.getAllByRole('link', { name: enMessages.HomePage.startFree }).length).toBeGreaterThan(0);
  });

  it('has localized metadata and the same keys in English and Hebrew, with no invented numbers or prices', async () => {
    expect(await generateMetadata({ params: Promise.resolve({ locale: 'he' }) })).toEqual({ title: heMessages.HomePage.metaTitle, description: heMessages.HomePage.metaDescription });
    const keys = (value: unknown, prefix = ''): string[] =>
      Object.entries(value as Record<string, unknown>).flatMap(([key, entry]) => (typeof entry === 'object' && entry ? keys(entry, `${prefix}${key}.`) : [`${prefix}${key}`]));
    expect(keys(heMessages.HomePage)).toEqual(keys(enMessages.HomePage));
    for (const messages of [enMessages.HomePage, heMessages.HomePage]) {
      expect(JSON.stringify(messages)).not.toMatch(/[$₪€]\s?\d|\d+\s?%|\d{2,}\s?(customers|users|\u05dc\u05e7\u05d5\u05d7\u05d5\u05ea|\u05de\u05e9\u05ea\u05de\u05e9\u05d9\u05dd)/);
    }
  });
});
