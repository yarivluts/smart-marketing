'use client';

import { useTranslations } from 'next-intl';

/** The error body every Ad Studio route returns (see `lib/ad-studio/http.ts`). */
export interface AdStudioApiError {
  error?: string;
  code?: string;
  reasons?: string[];
  limitKind?: 'text' | 'video' | 'image';
  used?: number;
  limit?: number;
}

const PROVIDER_CODES = new Set(['not_configured', 'provider_billing', 'rate_limited', 'refused', 'invalid_output', 'provider_error']);
const VIDEO_REQUEST_CODES = new Set(['scene_not_found', 'already_generating', 'clip_not_editable', 'invalid_instruction', 'not_ready', 'already_assembling']);
const ASSEMBLY_CODES = new Set(['ffmpeg_unavailable', 'ffmpeg_failed', 'storage_error']);
const IMAGE_REQUEST_CODES = new Set(['concept_not_found', 'format_not_in_concept', 'image_not_editable', 'invalid_instruction', 'image_not_ready']);

/** Turns a route's error body into one translated sentence. */
export function useAdStudioErrorMessage(): (body: AdStudioApiError) => string {
  const t = useTranslations('AdStudio');
  return (body) => {
    if (body.error === 'provider_failed' && body.code && PROVIDER_CODES.has(body.code)) return t(`providerErrors.${body.code}`);
    if (body.error === 'quota_exceeded') return t(body.limitKind === 'image' ? 'images.quotaExceeded' : 'quotaExceeded', { used: body.used ?? 0, limit: body.limit ?? 0 });
    if (body.error === 'invalid_brief') return t('errorInvalidBrief', { reasons: (body.reasons ?? []).join('; ') });
    if (body.error === 'invalid_script') return t('errorInvalidScript');
    if (body.error === 'video_request' && body.code && VIDEO_REQUEST_CODES.has(body.code)) return t(`videoRequestErrors.${body.code}`);
    if (body.error === 'assembly_failed' && body.code && ASSEMBLY_CODES.has(body.code)) return t(`assemblyErrors.${body.code}`);
    if (body.error === 'image_request' && body.code && IMAGE_REQUEST_CODES.has(body.code)) return t(`images.requestErrors.${body.code}`);
    if (body.error === 'invalid_concepts') return t('images.errorInvalidConcepts');
    if (body.error === 'run_active') return t('autopilot.errorRunActive');
    if (body.error === 'invalid_options') return t('autopilot.errorInvalidOptions');
    return t('errorGeneric');
  };
}

const CLIP_FAILURES = new Set([...PROVIDER_CODES, 'timed_out']);
const VIDEO_FAILURES = new Set([...ASSEMBLY_CODES, 'timed_out']);

/** A clip's or an assembled video's stored failure reason as a translated phrase. */
export function useAdStudioFailureReason(): { clip: (reason: string | null) => string; video: (reason: string | null) => string; image: (reason: string | null) => string } {
  const t = useTranslations('AdStudio');
  return {
    clip: (reason) => t(`clipFailure.${reason && CLIP_FAILURES.has(reason) ? reason : 'provider_error'}`),
    video: (reason) => t(`videoFailure.${reason && VIDEO_FAILURES.has(reason) ? reason : 'ffmpeg_failed'}`),
    // An image failure is a provider code (or storage_error); the clip wording covers each.
    image: (reason) => t(`clipFailure.${reason && CLIP_FAILURES.has(reason) ? reason : 'provider_error'}`),
  };
}
