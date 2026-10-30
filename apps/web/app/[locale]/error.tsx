'use client';

import * as Sentry from '@sentry/nextjs';
import { useTranslations } from 'next-intl';
import { useEffect } from 'react';
import { Link } from '@/i18n/navigation';

/**
 * A page that crashes shows a plain apology with two ways forward instead of the
 * framework's English "Application error" screen. The error still goes to Sentry.
 */
export default function LocaleError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}): React.ReactElement {
  const t = useTranslations('ErrorPage');

  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-4 px-4 text-center">
      <h1 className="text-2xl font-semibold">{t('title')}</h1>
      <p className="text-muted-foreground">{t('body')}</p>
      <div className="flex flex-wrap justify-center gap-3">
        <button type="button" onClick={reset} className="rounded-md bg-primary px-4 py-2 text-primary-foreground">
          {t('retry')}
        </button>
        <Link href="/" className="rounded-md border px-4 py-2">
          {t('home')}
        </Link>
      </div>
    </main>
  );
}
