import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { NextIntlClientProvider, hasLocale } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import '../globals.css';
import { routing, getDirection, type AppLocale } from '@/i18n/routing';
import { AppProviders } from '@/lib/providers/app-providers';

// Intercom-style clean, geometric sans — self-hosted via next/font (no runtime request to
// fonts.googleapis.com, so it works the same in every environment including offline CI/emulator
// runs), exposed as a CSS variable so tailwind.config.ts's `fontFamily.sans` can pick it up.
const inter = Inter({ subsets: ['latin'], variable: '--font-sans', display: 'swap' });

export function generateStaticParams(): Array<{ locale: AppLocale }> {
  return routing.locales.map((locale) => ({ locale }));
}

type LayoutProps = Readonly<{
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}>;

export async function generateMetadata({ params }: LayoutProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'Metadata' });
  return { title: t('title'), description: t('description') };
}

export default async function LocaleLayout({ children, params }: LayoutProps): Promise<React.ReactElement> {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }

  // Enables static rendering for this locale's server components.
  setRequestLocale(locale);

  return (
    <html lang={locale} dir={getDirection(locale)} className={inter.variable}>
      <body className="min-h-screen font-sans antialiased">
        <NextIntlClientProvider>
          <AppProviders>{children}</AppProviders>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
