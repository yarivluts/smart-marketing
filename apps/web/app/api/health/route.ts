import { NextResponse } from 'next/server';
import { readBuildSha } from '@growthos/shared';

/**
 * Public liveness + build identity for the web app (KAN-204), the web twin of the
 * API's `/v1/health`.
 *
 * `.github/workflows/prod-drift.yml` compares `buildSha` with `main` every hour. It
 * holds no production credentials, so this has to be readable with none: no session,
 * no cookie, no redirect. `middleware.ts`'s matcher skips every `/api/*` path, so the
 * auth gate and the locale redirect never see this route (`middleware.test.ts` pins
 * that for this exact path).
 *
 * A commit hash of an already-public repository discloses nothing, which is why it
 * is fine on an unauthenticated endpoint.
 *
 * `force-dynamic` + `no-store` because a health response served from any cache
 * reports a build that may no longer be running, which is exactly the lie a drift
 * check cannot afford.
 */
export const dynamic = 'force-dynamic';

export interface WebHealthStatus {
  status: 'ok';
  service: '@growthos/web';
  /** The commit this image was built from (`GIT_SHA`, stamped by deploy/cloudbuild.web.yaml), or `null` when unstamped. */
  buildSha: string | null;
}

export function GET(): NextResponse<WebHealthStatus> {
  return NextResponse.json(
    { status: 'ok', service: '@growthos/web', buildSha: readBuildSha(process.env.GIT_SHA) },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
