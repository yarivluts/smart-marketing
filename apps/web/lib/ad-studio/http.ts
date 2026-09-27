import 'server-only';
import { NextResponse } from 'next/server';
import {
  AdStudioBriefInvalidError,
  AdStudioBriefNotFoundError,
  AdStudioClipNotFoundError,
  AdStudioQuotaExceededError,
  AdStudioScriptInvalidError,
  AdStudioVideoNotFoundError,
  ProjectNotFoundError,
} from '@growthos/firebase-orm-models';
import { AdStudioProviderError } from './llm';
import { AdStudioAssemblyError, AdStudioVideoRequestError } from './video-pipeline';

const VIDEO_REQUEST_STATUS: Record<AdStudioVideoRequestError['code'], number> = {
  scene_not_found: 404,
  invalid_instruction: 400,
  already_generating: 409,
  clip_not_editable: 409,
  not_ready: 409,
  already_assembling: 409,
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
    error instanceof AdStudioVideoNotFoundError
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
  if (error instanceof AdStudioAssemblyError) {
    return NextResponse.json({ error: 'assembly_failed', code: error.code }, { status: error.code === 'ffmpeg_unavailable' ? 503 : 500 });
  }
  throw error;
}
