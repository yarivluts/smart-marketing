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

const REPO = resolve(__dirname, '../../../..');

interface WatchedService {
  healthUrl: string;
  watchedPaths: string[];
}

/** The matrix entries, read as text: `- service:` / `health_url:` / optional `watched_paths:`. */
function watchedServices(workflow: string): Record<string, WatchedService> {
  const services: Record<string, WatchedService> = {};
  const entry = /^\s*- service: (\S+)\s*\n\s*health_url: (\S+)\s*(?:\n\s*watched_paths: (.+))?$/gm;
  for (const match of workflow.matchAll(entry)) {
    services[match[1]!] = { healthUrl: match[2]!, watchedPaths: (match[3] ?? '').trim().split(/\s+/).filter(Boolean) };
  }
  return services;
}

/**
 * KAN-204. On 2026-09-25 the dbt-refresh job was found running a 2026-09-10 image:
 * fifteen days of merged model changes had never reached production, and nothing
 * noticed because only the API was watched. Every deployable production image is
 * now watched, and each is read from a PUBLIC URL - so adding them cost the workflow
 * no credentials (the assertions above still hold with all four in the matrix).
 */
describe('prod-drift watches every production image (KAN-204)', () => {
  it('watches api-prod, api-preprod, web-prod, web-preprod and dbt-refresh', () => {
    expect(Object.keys(watchedServices(read(WORKFLOW))).sort()).toEqual(['api-preprod', 'api-prod', 'dbt-refresh', 'web-preprod', 'web-prod']);
  });

  it('reads each from a public https endpoint, the one each service reports its build on', () => {
    const services = watchedServices(read(WORKFLOW));
    expect(Object.values(services).every((s) => s.healthUrl.startsWith('https://'))).toBe(true);
    expect({
      apiProd: new URL(services['api-prod']!.healthUrl).pathname,
      webProd: new URL(services['web-prod']!.healthUrl).pathname,
      webHost: new URL(services['web-prod']!.healthUrl).hostname.startsWith('web-prod-'),
      // The job has no endpoint: api-prod reports it, from the same host as api-prod's own health.
      dbt: new URL(services['dbt-refresh']!.healthUrl).pathname,
      dbtViaApiProd: new URL(services['dbt-refresh']!.healthUrl).host === new URL(services['api-prod']!.healthUrl).host,
    }).toEqual({ apiProd: '/v1/health', webProd: '/api/health', webHost: true, dbt: '/v1/health/dbt-refresh', dbtViaApiProd: true });
  });

  it('exists at the routes those URLs name', () => {
    expect({
      webRoute: existsSync(resolve(REPO, 'apps/web/app/api/health/route.ts')),
      dbtRoute: /@Get\('dbt-refresh'\)/.test(read(resolve(REPO, 'apps/api/src/health/health.controller.ts'))),
    }).toEqual({ webRoute: true, dbtRoute: true });
  });

  it('passes each entry\'s watched paths to the script, which narrows git log to them', () => {
    expect({
      workflow: /DRIFT_PATHS: \$\{\{ matrix\.watched_paths \}\}/.test(read(WORKFLOW)),
      script: /process\.env\.DRIFT_PATHS/.test(read(SCRIPT)) && /'--', \.\.\.WATCHED_PATHS/.test(read(SCRIPT)),
    }).toEqual({ workflow: true, script: true });
  });

  /**
   * Narrowing is only safe if it covers everything the image is built from: a path
   * the Dockerfile copies but the check ignores is a change that can sit undeployed
   * forever while the check reports "current" - the silently green failure again.
   */
  it('narrows dbt-refresh to paths that cover everything its image is built from', () => {
    const watched = watchedServices(read(WORKFLOW))['dbt-refresh']!.watchedPaths;
    const dockerfile = read(resolve(REPO, 'packages/dbt-transform/Dockerfile'));
    const copied = [...dockerfile.matchAll(/^COPY\s+(.+)\s+\S+$/gm)].flatMap((m) => m[1]!.trim().split(/\s+/));
    const inputs = [...copied, 'packages/dbt-transform/Dockerfile', 'deploy/cloudbuild.dbt.yaml'];
    const uncovered = inputs.filter((input) => !watched.some((path) => input === path || input.startsWith(`${path}/`)));
    expect({ copiedSomething: copied.length > 0, uncovered }).toEqual({ copiedSomething: true, uncovered: [] });
  });

  it('holds every other service to all of main', () => {
    const services = watchedServices(read(WORKFLOW));
    expect(['api-prod', 'api-preprod', 'web-prod', 'web-preprod'].map((name) => services[name]!.watchedPaths)).toEqual([[], [], [], []]);
  });

  /**
   * The check can only see a build SHA that was stamped. Each image's build config
   * passes `_GIT_SHA` (default '' - which reads as "unstamped", never as a commit)
   * and each Dockerfile carries it into the running container's environment.
   */
  it.each([
    ['api', 'deploy/cloudbuild.api.yaml', 'apps/api/Dockerfile'],
    ['web', 'deploy/cloudbuild.web.yaml', 'apps/web/Dockerfile'],
    ['dbt', 'deploy/cloudbuild.dbt.yaml', 'packages/dbt-transform/Dockerfile'],
  ])('stamps GIT_SHA into the %s image', (_image, cloudbuild, dockerfile) => {
    const build = read(resolve(REPO, cloudbuild));
    const docker = read(resolve(REPO, dockerfile));
    expect({
      buildArg: /GIT_SHA=\$\{_GIT_SHA\}/.test(build),
      defaultEmpty: /^\s*_GIT_SHA: ''\s*$/m.test(build),
      arg: /^ARG GIT_SHA=""\s*$/m.test(docker),
      env: /^ENV GIT_SHA=\$GIT_SHA\s*$/m.test(docker),
    }).toEqual({ buildArg: true, defaultEmpty: true, arg: true, env: true });
  });

  /** The web image is multi-stage: GIT_SHA must reach the stage that actually runs. */
  it('sets GIT_SHA in the web image\'s final (runtime) stage', () => {
    const docker = read(resolve(REPO, 'apps/web/Dockerfile'));
    const finalStage = docker.slice(docker.lastIndexOf('\nFROM '));
    expect(/^ENV GIT_SHA=\$GIT_SHA\s*$/m.test(finalStage)).toBe(true);
  });
});
