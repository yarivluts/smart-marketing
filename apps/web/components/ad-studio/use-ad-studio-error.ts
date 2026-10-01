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
const VOICE_CODES = new Set(['unknown_voice', 'voice_description_required', 'voice_description_too_long']);
const VIDEO_SETTINGS_CODES = new Set(['unknown_resolution', 'unknown_style', 'unknown_music', 'music_description_required', 'music_description_too_long', 'avoid_too_long']);
const REFERENCE_REQUEST_CODES = new Set([
  'unsupported_image',
  'image_too_large',
  'illustration_not_configured',
  'reference_not_ready',
  'label_required',
  'label_too_long',
  'description_too_long',
  'library_full',
]);

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
    if (body.error === 'invalid_copy') return t('copy.errorInvalid');
    if (body.error === 'invalid_voice' && body.code && VOICE_CODES.has(body.code)) return t(`voice.errors.${body.code}`);
    if (body.error === 'invalid_video_settings' && body.code && VIDEO_SETTINGS_CODES.has(body.code)) return t(`advanced.errors.${body.code}`);
    if (body.error === 'reference_request' && body.code && REFERENCE_REQUEST_CODES.has(body.code)) return t(`references.errors.${body.code}`);
    if (body.error === 'run_active') return t('autopilot.errorRunActive');
    if (body.error === 'invalid_options') return t('autopilot.errorInvalidOptions');
    return t('errorGeneric');
  };
}

const CLIP_FAILURES = new Set([...PROVIDER_CODES, 'timed_out']);
const VIDEO_FAILURES = new Set([...ASSEMBLY_CODES, 'timed_out']);
const IMAGE_FAILURES = new Set([...PROVIDER_CODES, 'storage_error']);

/** A clip's, an assembled video's or an image's stored failure reason as a translated phrase. */
export function useAdStudioFailureReason(): { clip: (reason: string | null) => string; video: (reason: string | null) => string; image: (reason: string | null) => string } {
  const t = useTranslations('AdStudio');
  return {
    clip: (reason) => t(`clipFailure.${reason && CLIP_FAILURES.has(reason) ? reason : 'provider_error'}`),
    video: (reason) => t(`videoFailure.${reason && VIDEO_FAILURES.has(reason) ? reason : 'ffmpeg_failed'}`),
    image: (reason) => t(`imageFailure.${reason && IMAGE_FAILURES.has(reason) ? reason : 'provider_error'}`),
  };
}
