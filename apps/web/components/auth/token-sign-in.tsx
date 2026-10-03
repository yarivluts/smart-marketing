'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import { Loader2, AlertCircle, ArrowLeft } from 'lucide-react';
import { Link, useRouter } from '@/i18n/navigation';
import { useAuth } from '@/lib/auth/auth-context';
import { authErrorMessageKey, type AuthErrorMessageKey } from '@/lib/auth/auth-error';
import { resolveRedirectTarget } from '@/lib/auth/redirect-target';
import { PpButton, PpIconChip } from '@/components/pastel/primitives';

/**
 * `/login/token?token=…` — exchanges a Firebase custom token for a real
 * session, entirely client-side. Deliberately not linked from anywhere in
 * the UI (no button on `/login`): this is a support/automation bridge —
 * minted out-of-band via the Admin SDK (`createCustomToken(uid)`) by
 * whoever already holds this project's service-account credentials, for an
 * account that has no password to offer instead (e.g. a Google-only
 * account someone else needs one-time access to). See `AuthContextValue.
 * signInWithToken`'s doc comment for why a hidden route here adds no new
 * attack surface: only Admin SDK access can mint a token this page will
 * accept, and it expires within about an hour.
 */
export function TokenSignIn(): React.ReactElement {
  const t = useTranslations('Auth');
  const router = useRouter();
  const searchParams = useSearchParams();
  const { signInWithToken } = useAuth();
  const [errorKey, setErrorKey] = useState<AuthErrorMessageKey | null>(null);
  // StrictMode/effect-rerun guard: a custom token is meant to be exchanged
  // once — firing the sign-in call twice would either double-submit
  // harmlessly or, worse, mask a real error behind a second attempt.
  const attempted = useRef(false);

  useEffect(() => {
    if (attempted.current) {
      return;
    }
    attempted.current = true;

    const token = searchParams.get('token');
    if (!token) {
      setErrorKey('genericError');
      return;
    }

    signInWithToken(token)
      .then(() => router.push(resolveRedirectTarget(searchParams.get('from'))))
      .catch((error: unknown) => setErrorKey(authErrorMessageKey(error)));
  }, [searchParams, signInWithToken, router]);

  return (
    <div className="mx-auto flex w-full max-w-sm flex-col items-center gap-4 py-8 text-center">
      {errorKey ? (
        <>
          <PpIconChip icon={AlertCircle} accent="error" size="lg" />
          <p role="alert" className="text-pp-body-md text-pp-error font-medium">
            {t(errorKey)}
          </p>
          <div className="mt-2">
            <PpButton variant="secondary" asChild>
              <Link href="/login" className="inline-flex items-center gap-2">
                <ArrowLeft className="h-4 w-4 rtl:rotate-180" />
                <span>{t('backToSignIn')}</span>
              </Link>
            </PpButton>
          </div>
        </>
      ) : (
        <div className="flex flex-col items-center gap-4 py-6">
          <Loader2 className="h-10 w-10 animate-spin text-pp-primary" />
          <p className="font-pp-display text-pp-headline-md text-pp-on-surface">
            {t('tokenSignInPending')}
          </p>
        </div>
      )}
    </div>
  );
}
