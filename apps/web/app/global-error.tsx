'use client';

import * as Sentry from '@sentry/nextjs';
import { useEffect } from 'react';
import { ErrorPage as enText } from '@/messages/en.json';
import { ErrorPage as heText } from '@/messages/he.json';
import { getDirection } from '@/i18n/routing';

/**
 * Next.js App Router boundary of last resort. Anything that escapes every
 * other error boundary lands here; report it to Sentry (KAN-20), then show the
 * same plain apology as the page-level error screen. It renders outside the
 * locale layout, so the language comes from the address and the texts are read
 * straight from the message files.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset?: () => void;
}): React.ReactElement {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  const locale =
    typeof window !== 'undefined' && window.location.pathname.split('/')[1] === 'he' ? 'he' : 'en';
  const t = locale === 'he' ? heText : enText;

  return (
    <html lang={locale} dir={getDirection(locale)}>
      <body>
        <main
          style={{
            display: 'flex',
            minHeight: '100vh',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 16,
            padding: 16,
            textAlign: 'center',
            fontFamily: 'system-ui, sans-serif',
          }}
        >
          <h1 style={{ fontSize: 24, fontWeight: 600 }}>{t.title}</h1>
          <p style={{ maxWidth: 420 }}>{t.body}</p>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center' }}>
            {reset ? (
              <button type="button" onClick={reset} style={{ padding: '8px 16px' }}>
                {t.retry}
              </button>
            ) : null}
            <a href={`/${locale}`} style={{ padding: '8px 16px' }}>
              {t.home}
            </a>
          </div>
        </main>
      </body>
    </html>
  );
}
