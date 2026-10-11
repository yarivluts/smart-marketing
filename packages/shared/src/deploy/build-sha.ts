/**
 * Normalizes the build SHA an image was stamped with (KAN-180, KAN-204).
 *
 * Every deployable GrowthOS image — the API, the web app and the dbt-refresh job —
 * is built with a `GIT_SHA` build arg and reports it publicly, so
 * `.github/workflows/prod-drift.yml` can compare production against `main` with
 * no credentials. They share this one validator so the three cannot disagree
 * about what counts as "stamped".
 *
 * Accepts only something shaped like a git hash, so a mis-set or placeholder
 * build arg (an empty string, a literal `$SHORT_SHA` that never got substituted)
 * reads as `null` — "not stamped" — instead of being reported as a commit that
 * does not exist.
 *
 * `null` rather than a guess such as `"unknown"`: the drift check must be able to
 * tell "this image predates build-SHA stamping" from "this image is at commit X",
 * and a sentinel string is exactly the kind of value that gets compared as
 * though it were real.
 */
export function readBuildSha(raw: string | null | undefined): string | null {
  const trimmed = raw?.trim().toLowerCase() ?? '';
  return /^[0-9a-f]{7,40}$/.test(trimmed) ? trimmed : null;
}
