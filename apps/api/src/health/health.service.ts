import { Injectable } from '@nestjs/common';
import { ENVIRONMENTS, isEnvironment, type Environment } from '@growthos/shared';

export interface HealthStatus {
  status: 'ok';
  service: string;
  environment: Environment;
  environments: readonly Environment[];
  /** Seconds since this process started; a live-but-just-restarted process is
   * a signal worth surfacing to whatever polls this endpoint as an uptime check. */
  uptimeSeconds: number;
  /**
   * The git commit this image was built from, or `null` when the image was built
   * without one (KAN-180).
   *
   * Exists so production can be compared against `main` from outside, with no
   * credentials. Nothing deploys on merge, and nothing noticed when the running
   * API fell behind: the dry-run fix sat merged-but-not-live for a day, then
   * the scope fix did the same — twice in one week an integrator was blocked
   * on code that was already written, reviewed and green.
   *
   * On a public endpoint deliberately. A commit hash of an already-public
   * repository discloses nothing, and making it readable without a key is what
   * lets a scheduled check run with no production access at all.
   *
   * `null` rather than a guess such as `"unknown"`: the drift check must be able
   * to tell "this image predates build-SHA stamping" from "this image is at
   * commit X", and a sentinel string is exactly the kind of value that gets
   * compared as though it were real.
   */
  buildSha: string | null;
}

/**
 * Normalizes the build SHA the image was stamped with. Accepts only something
 * shaped like a git hash, so a mis-set or placeholder build arg (an empty
 * string, a literal `$SHORT_SHA` that never got substituted) reads as `null` —
 * "not stamped" — instead of being reported as a commit that does not exist.
 */
export function readBuildSha(raw: string | undefined): string | null {
  const trimmed = raw?.trim().toLowerCase() ?? '';
  return /^[0-9a-f]{7,40}$/.test(trimmed) ? trimmed : null;
}

@Injectable()
export class HealthService {
  getHealth(): HealthStatus {
    const configured = process.env.GROWTHOS_ENV;
    const environment: Environment = configured && isEnvironment(configured) ? configured : 'dev';

    return {
      status: 'ok',
      service: '@growthos/api',
      environment,
      environments: ENVIRONMENTS,
      uptimeSeconds: Math.floor(process.uptime()),
      buildSha: readBuildSha(process.env.GIT_SHA),
    };
  }
}
