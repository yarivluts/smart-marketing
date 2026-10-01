import 'server-only';
import { NextResponse } from 'next/server';
import {
  AdStudioBriefInvalidError,
  AdStudioBriefNotFoundError,
  AdStudioClipNotFoundError,
  AdStudioQuotaExceededError,
  AdStudioScriptInvalidError,
  AdStudioVideoNotFoundError,
  AdStudioImageConceptsInvalidError,
  AdStudioImageNotFoundError,
  AdStudioImageNotReadyError,
  AdStudioReferenceInvalidError,
  AdStudioReferenceNotFoundError,
  AdStudioRunAlreadyActiveError,
  AdStudioRunNotFoundError,
  AdStudioRunOptionsInvalidError,
  ProjectNotFoundError,
} from '@growthos/firebase-orm-models';
import { AdStudioAssemblyError, AdStudioImageRequestError, AdStudioProviderError, AdStudioReferenceRequestError, AdStudioVideoRequestError } from './engine';

const IMAGE_REQUEST_STATUS: Record<AdStudioImageRequestError['code'], number> = {
  concept_not_found: 404,
  format_not_in_concept: 400,
  invalid_instruction: 400,
  image_not_editable: 409,
  image_not_ready: 409,
};

const VIDEO_REQUEST_STATUS: Record<AdStudioVideoRequestError['code'], number> = {
  scene_not_found: 404,
  invalid_instruction: 400,
  already_generating: 409,
  clip_not_editable: 409,
  not_ready: 409,
  already_assembling: 409,
};

const REFERENCE_REQUEST_STATUS: Record<AdStudioReferenceRequestError['code'], number> = {
  unsupported_image: 400,
  image_too_large: 413,
  illustration_not_configured: 503,
  reference_not_ready: 409,
};

/**
 * Maps every Ad Studio failure to a stable JSON code the UI translates. Unknown errors are
 * rethrown so the framework's normal 500 handling (and logging) applies.
 */
export function adStudioErrorResponse(error: unknown): NextResponse {
  if (error instanceof AdStudioBriefInvalidError) {
    return NextResponse.json({ error: 'invalid_brief', reasons: error.reasons }, { status: 400 });
  }
  if (error instanceof AdStudioScriptInvalidError) {
    return NextResponse.json({ error: 'invalid_script', issues: error.issues }, { status: 400 });
  }
  if (
    error instanceof AdStudioBriefNotFoundError ||
    error instanceof ProjectNotFoundError ||
    error instanceof AdStudioClipNotFoundError ||
    error instanceof AdStudioVideoNotFoundError ||
    error instanceof AdStudioImageNotFoundError ||
    error instanceof AdStudioRunNotFoundError ||
    error instanceof AdStudioReferenceNotFoundError
  ) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }
  if (error instanceof AdStudioQuotaExceededError) {
    return NextResponse.json({ error: 'quota_exceeded', limitKind: error.limitKind, used: error.used, limit: error.limit }, { status: 429 });
  }
  if (error instanceof AdStudioProviderError) {
    const status = error.code === 'not_configured' ? 503 : error.code === 'rate_limited' ? 429 : 502;
    return NextResponse.json({ error: 'provider_failed', code: error.code }, { status });
  }
  if (error instanceof AdStudioVideoRequestError) {
    return NextResponse.json({ error: 'video_request', code: error.code }, { status: VIDEO_REQUEST_STATUS[error.code] });
  }
  if (error instanceof AdStudioImageConceptsInvalidError) {
    return NextResponse.json({ error: 'invalid_concepts', issues: error.issues }, { status: 400 });
  }
  if (error instanceof AdStudioImageRequestError) {
    return NextResponse.json({ error: 'image_request', code: error.code }, { status: IMAGE_REQUEST_STATUS[error.code] });
  }
  if (error instanceof AdStudioImageNotReadyError) {
    return NextResponse.json({ error: 'image_request', code: 'image_not_ready' }, { status: 409 });
  }
  if (error instanceof AdStudioReferenceRequestError) {
    return NextResponse.json({ error: 'reference_request', code: error.code }, { status: REFERENCE_REQUEST_STATUS[error.code] });
  }
  if (error instanceof AdStudioReferenceInvalidError) {
    return NextResponse.json({ error: 'reference_request', code: error.code }, { status: error.code === 'library_full' ? 409 : 400 });
  }
  if (error instanceof AdStudioRunAlreadyActiveError) {
    return NextResponse.json({ error: 'run_active', runId: error.runId }, { status: 409 });
  }
  if (error instanceof AdStudioRunOptionsInvalidError) {
    return NextResponse.json({ error: 'invalid_options', reasons: error.reasons }, { status: 400 });
  }
  if (error instanceof AdStudioAssemblyError) {
    return NextResponse.json({ error: 'assembly_failed', code: error.code }, { status: error.code === 'ffmpeg_unavailable' ? 503 : 500 });
  }
  throw error;
}
