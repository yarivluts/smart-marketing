'use client';

import * as Sentry from '@sentry/nextjs';
import NextError from 'next/error';
import { useEffect } from 'react';

/**
 * Next.js App Router boundary of last resort. Anything that escapes every
 * other error boundary lands here; report it to Sentry (KAN-20) before
 * falling back to Next's default error page.
 */
export default function GlobalError({
  error,
}: {
  error: Error & { digest?: string };
}): React.ReactElement {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html>
      <body>
        <NextError statusCode={0} />
      </body>
    </html>
  );
}
