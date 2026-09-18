import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Guards the CI workflow's TRIGGERS — not what CI does, but which pull
 * requests it runs on at all.
 *
 * The failure this pins is worse than a broken build, because a broken build
 * is loud. `on.pull_request.branches: [main]` filters on the PR's *base*, so a
 * PR stacked on another branch matched nothing and got **no checks at all**.
 * `gh pr list --json statusCheckRollup` then returns an empty array, which
 * renders identically to a PR whose checks have not started — and nothing
 * anywhere says "this PR will never be checked". Three PRs merged to `main`
 * that way in a single afternoon, each reported as merged-when-green.
 *
 * `edited` is the second half. It is the event fired when a PR's base branch
 * changes, and it is absent from the default type set (`opened`,
 * `synchronize`, `reopened`). Retargeting a stacked PR onto `main` — the
 * standard way to unstack before merging — therefore did not start CI either,
 * so the obvious fix for the first problem silently did not work.
 *
 * Read as text rather than parsed: the repo has no YAML parser in its
 * dependency tree, and adding one to assert five lines of config would be a
 * worse trade than matching on them. The assertions are written against the
 * specific mistakes, so they say what is wrong rather than that a regex did
 * not match.
 */
const WORKFLOW_PATH = resolve(__dirname, '../../../../.github/workflows/ci.yml');

function readWorkflow(): string {
  return readFileSync(WORKFLOW_PATH, 'utf8');
}

/** The `on:` block, up to the next top-level key — so a `branches:` under `jobs:` can never be mistaken for a trigger filter. */
function triggerBlock(workflow: string): string {
  const start = workflow.indexOf('\non:');
  expect({ hasOnBlock: start >= 0 }).toEqual({ hasOnBlock: true });
  const rest = workflow.slice(start + 1);
  const nextTopLevel = rest.slice(3).search(/\n[a-z]/);
  return nextTopLevel < 0 ? rest : rest.slice(0, nextTopLevel + 3);
}

describe('CI runs on every pull request, not only those targeting main', () => {
  it('has a pull_request trigger at all', () => {
    expect({ hasPullRequestTrigger: triggerBlock(readWorkflow()).includes('pull_request:') }).toEqual({
      hasPullRequestTrigger: true,
    });
  });

  it('does not filter pull requests by base branch', () => {
    const block = triggerBlock(readWorkflow());
    const pullRequest = block.slice(block.indexOf('pull_request:'));

    // A `branches:` here would exclude every stacked PR from CI *silently* —
    // no checks rather than failing checks. The `push:` trigger above keeps its
    // own `branches: [main]`, which is correct and unaffected: that one filters
    // the pushed ref, not a PR base.
    expect({ basedFilteredPullRequests: /\bbranches(-ignore)?:/.test(pullRequest) }).toEqual({
      basedFilteredPullRequests: false,
    });
  });

  it('runs again when a pull request is retargeted', () => {
    const block = triggerBlock(readWorkflow());
    const pullRequest = block.slice(block.indexOf('pull_request:'));

    // Without `edited`, changing a PR's base fires nothing, so a stacked PR
    // moved onto `main` keeps whatever checks it had — which, for a PR that was
    // never eligible, is none.
    expect({ rerunsOnRetarget: /types:.*\bedited\b/.test(pullRequest) }).toEqual({ rerunsOnRetarget: true });
  });

  it('still runs on pushes to main', () => {
    const block = triggerBlock(readWorkflow());
    const push = block.slice(block.indexOf('push:'), block.indexOf('pull_request:'));
    expect({ pushTriggersOnMain: push.includes('main') }).toEqual({ pushTriggersOnMain: true });
  });
});
