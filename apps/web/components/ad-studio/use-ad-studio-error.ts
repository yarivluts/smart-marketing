'use client';

import { useTranslations } from 'next-intl';

/** The error body every Ad Studio route returns (see `lib/ad-studio/http.ts`). */
export interface AdStudioApiError {
  error?: string;
  code?: string;
  reasons?: string[];
  limitKind?: 'text' | 'video';
  used?: number;
  limit?: number;
}

const PROVIDER_CODES = new Set(['not_configured', 'provider_billing', 'rate_limited', 'refused', 'invalid_output', 'provider_error']);

/** Turns a route's error body into one translated sentence. */
export function useAdStudioErrorMessage(): (body: AdStudioApiError) => string {
  const t = useTranslations('AdStudio');
  return (body) => {
    if (body.error === 'provider_failed' && body.code && PROVIDER_CODES.has(body.code)) return t(`providerErrors.${body.code}`);
    if (body.error === 'quota_exceeded') return t('quotaExceeded', { used: body.used ?? 0, limit: body.limit ?? 0 });
    if (body.error === 'invalid_brief') return t('errorInvalidBrief', { reasons: (body.reasons ?? []).join('; ') });
    if (body.error === 'invalid_script') return t('errorInvalidScript');
    return t('errorGeneric');
  };
}
