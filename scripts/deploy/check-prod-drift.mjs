#!/usr/bin/env node
/**
 * Reports whether production `api-prod` is running what `main` says it should
 * (KAN-180).
 *
 * Nothing deploys on merge, and until this nothing noticed when production fell
 * behind: twice in one week an integrator was blocked on a fix that was merged,
 * green and simply not deployed. This makes the owed deploy visible.
 *
 * Needs NO production credentials. It reads the public `/v1/health` endpoint,
 * where the API reports the commit it was built from, and compares that with
 * the local git history. That is deliberate: a drift check holding deploy
 * rights would be a much larger thing to trust than one that can only read.
 *
 *   node scripts/deploy/check-prod-drift.mjs
 *
 * Exits 1 when production has drifted past the grace period, so a scheduled
 * run goes red. In GitHub Actions it also opens (or updates, or closes) a
 * single tracking issue; run locally it only reports.
 *
 * Requires the full git history (`fetch-depth: 0`) — `git log A..B` against a
 * shallow clone silently reports nothing, which would read as "current".
 */
import { execFileSync } from 'node:child_process';
import { assessProdDrift, DEFAULT_PROD_DRIFT_GRACE_HOURS } from '../../packages/shared/dist/index.js';

const HEALTH_URL = process.env.PROD_HEALTH_URL ?? 'https://api-prod-1098891924957.me-west1.run.app/v1/health';
const MAIN_REF = process.env.MAIN_REF ?? 'origin/main';
const ISSUE_TITLE = 'Production api-prod has drifted behind main';

function git(...args) {
  return execFileSync('git', args, { encoding: 'utf8' }).trim();
}

async function readDeployedSha() {
  const response = await fetch(HEALTH_URL);
  if (!response.ok) {
    throw new Error(`${HEALTH_URL} returned HTTP ${response.status}`);
  }
  const body = await response.json();
  return typeof body.buildSha === 'string' && body.buildSha.length > 0 ? body.buildSha : null;
}

function undeployedCommits(deployedSha) {
  if (deployedSha === null) return [];
  // An unknown SHA (e.g. force-pushed away) must fail loudly rather than
  // produce an empty range, which would read as "production is current".
  git('cat-file', '-e', `${deployedSha}^{commit}`);
  const log = git('log', '--format=%H %cI', `${deployedSha}..${MAIN_REF}`);
  return log === '' ? [] : log.split('\n').map((line) => {
    const [sha, committedAt] = line.split(' ');
    return { sha, committedAt };
  });
}

function gh(...args) {
  return execFileSync('gh', args, { encoding: 'utf8' }).trim();
}

function syncTrackingIssue(assessment) {
  const existing = gh('issue', 'list', '--state', 'open', '--search', `in:title "${ISSUE_TITLE}"`, '--json', 'number', '--jq', '.[0].number // ""');
  if (assessment.status === 'drifted') {
    const body = `${assessment.message}\n\nChecked ${new Date().toISOString()} by \`scripts/deploy/check-prod-drift.mjs\` (KAN-180). This issue closes itself on the first run after production is current.`;
    if (existing) {
      gh('issue', 'edit', existing, '--body', body);
    } else {
      gh('issue', 'create', '--title', ISSUE_TITLE, '--body', body);
    }
  } else if (existing && assessment.status === 'current') {
    gh('issue', 'close', existing, '--comment', `Resolved: ${assessment.message}`);
  }
}

const deployedSha = await readDeployedSha();
const mainSha = git('rev-parse', MAIN_REF);
const assessment = assessProdDrift({
  deployedSha,
  mainSha,
  undeployedCommits: undeployedCommits(deployedSha),
  now: new Date(),
  graceHours: DEFAULT_PROD_DRIFT_GRACE_HOURS,
});

const inActions = process.env.GITHUB_ACTIONS === 'true';
const annotation = assessment.status === 'drifted' ? '::error::' : assessment.status === 'unstamped' ? '::warning::' : '';
console.log(`${inActions ? annotation : ''}[${assessment.status}] ${assessment.message}`);

if (inActions) {
  syncTrackingIssue(assessment);
}

process.exit(assessment.status === 'drifted' ? 1 : 0);
