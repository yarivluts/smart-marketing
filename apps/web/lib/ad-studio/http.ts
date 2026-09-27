import 'server-only';
import { NextResponse } from 'next/server';
import {
  AdStudioBriefInvalidError,
  AdStudioBriefNotFoundError,
  AdStudioQuotaExceededError,
  AdStudioScriptInvalidError,
  ProjectNotFoundError,
} from '@growthos/firebase-orm-models';
import { AdStudioProviderError } from './llm';

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
  if (error instanceof AdStudioBriefNotFoundError || error instanceof ProjectNotFoundError) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }
  if (error instanceof AdStudioQuotaExceededError) {
    return NextResponse.json({ error: 'quota_exceeded', limitKind: error.limitKind, used: error.used, limit: error.limit }, { status: 429 });
  }
  if (error instanceof AdStudioProviderError) {
    const status = error.code === 'not_configured' ? 503 : error.code === 'rate_limited' ? 429 : 502;
    return NextResponse.json({ error: 'provider_failed', code: error.code }, { status });
  }
  throw error;
}
