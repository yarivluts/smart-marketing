import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Guards `.github/workflows/prod-drift.yml` (KAN-180) — mostly its limits.
 *
 * The workflow exists because nothing noticed production falling behind main:
 * twice in one week a merged, green fix sat undeployed while an integrator was
 * blocked on it. Its whole design rests on one property — it can LOOK at
 * production and never touch it. It reads the public /v1/health build SHA and
 * compares with git history; it holds no production credentials.
 *
 * That property is easy to erode one convenient edit at a time ("let it just
 * redeploy when it notices"), and the erosion is invisible in review because
 * the file still does the drift check. So the test pins what the workflow must
 * NOT have, not only what it must.
 *
 * Read as text, like `ci-workflow.test.ts`: there is no YAML parser in the
 * dependency tree and adding one to assert a handful of lines is a poor trade.
 */
const WORKFLOW = resolve(__dirname, '../../../../.github/workflows/prod-drift.yml');
const SCRIPT = resolve(__dirname, '../../../../scripts/deploy/check-prod-drift.mjs');

function read(path: string): string {
  return readFileSync(path, 'utf8');
}

describe('prod-drift workflow (KAN-180)', () => {
  it('exists alongside the script it runs', () => {
    expect({ workflow: existsSync(WORKFLOW), script: existsSync(SCRIPT) }).toEqual({ workflow: true, script: true });
  });

  it('runs on a schedule, so drift is noticed without anyone remembering to look', () => {
    expect({ scheduled: /\bschedule:\s*\n\s*-\s*cron:/.test(read(WORKFLOW)) }).toEqual({ scheduled: true });
  });

  /**
   * The load-bearing assertion. A drift check that could deploy would be a very
   * different and much riskier thing to trust — and would quietly become
   * deploy-on-merge without anyone having decided that. It may use the built-in
   * `github.token` for the tracking issue and nothing else.
   */
  it('holds no production credentials and no secrets beyond the built-in token', () => {
    const workflow = read(WORKFLOW);
    const secrets = [...workflow.matchAll(/\$\{\{\s*secrets\.([A-Za-z0-9_]+)\s*\}\}/g)].map((m) => m[1]);
    expect({ customSecrets: secrets }).toEqual({ customSecrets: [] });
    expect({
      gcpAuth: /google-github-actions\/auth|workload_identity|credentials_json|GOOGLE_APPLICATION_CREDENTIALS/.test(workflow),
      deploys: /gcloud\s+run\s+deploy|builds\s+submit/.test(workflow),
      oidc: /id-token:\s*write/.test(workflow),
    }).toEqual({ gcpAuth: false, deploys: false, oidc: false });
  });

  it('asks only for the permissions it uses: read the repo, manage one issue', () => {
    const workflow = read(WORKFLOW);
    expect({
      contentsRead: /contents:\s*read/.test(workflow),
      issuesWrite: /issues:\s*write/.test(workflow),
      contentsWrite: /contents:\s*write/.test(workflow),
    }).toEqual({ contentsRead: true, issuesWrite: true, contentsWrite: false });
  });

  /**
   * `git log A..B` against a shallow clone returns nothing, which the script
   * would read as "production is current". The failure mode of a missing
   * `fetch-depth: 0` is therefore a silently green check — the worst kind.
   */
  it('checks out full history, because a shallow clone makes the check silently report "current"', () => {
    expect({ fullHistory: /fetch-depth:\s*0\b/.test(read(WORKFLOW)) }).toEqual({ fullHistory: true });
  });

  /**
   * api-preprod shares api-prod's Firestore and warehouse (KAN-207): an old build there
   * corrupts production data exactly as an old api-prod would, and on 2026-09-25 one did.
   */
  it('watches every service that writes to production data: api-prod and api-preprod', () => {
    const workflow = read(WORKFLOW);
    expect({
      prod: /service: api-prod$/m.test(workflow),
      preprod: /service: api-preprod$/m.test(workflow),
      perServiceIssue: /SERVICE_NAME: \$\{\{ matrix\.service \}\}/.test(workflow) && /process\.env\.SERVICE_NAME/.test(read(SCRIPT)),
    }).toEqual({ prod: true, preprod: true, perServiceIssue: true });
  });

  it('never deploys from the script either', () => {
    const script = read(SCRIPT);
    expect({ deploys: /run\s+deploy|builds\s+submit|update-traffic/.test(script) }).toEqual({ deploys: false });
  });
});
