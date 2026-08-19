// Unit tests for `resolveOrchestrationTarget` (see that module's own doc
// comment). Uses Node's built-in test runner rather than a new dependency —
// this package deliberately has no JS unit-test framework today (its own
// `pnpm test` runs a real `dbt build` — see `run-dbt.mjs`), and `node:test`
// is available in every Node version this repo already requires, so no
// `package.json`/`requirements.txt` change is needed to run this file.
import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import { resolveOrchestrationTarget } from './orchestration-target.mjs';

describe('resolveOrchestrationTarget', () => {
  it('stays on dev when neither a project id nor a dataset is configured', () => {
    assert.equal(resolveOrchestrationTarget({}), 'dev');
  });

  it('stays on dev when only the project id is configured', () => {
    assert.equal(resolveOrchestrationTarget({ GOOGLE_CLOUD_PROJECT: 'growthos-g2w84' }), 'dev');
  });

  it('stays on dev when only the dataset is configured', () => {
    assert.equal(resolveOrchestrationTarget({ GROWTHOS_BIGQUERY_CORE_DATASET: 'growthos_core' }), 'dev');
  });

  it('switches to prod once both GOOGLE_CLOUD_PROJECT and the dataset are configured', () => {
    assert.equal(
      resolveOrchestrationTarget({ GOOGLE_CLOUD_PROJECT: 'growthos-g2w84', GROWTHOS_BIGQUERY_CORE_DATASET: 'growthos_core' }),
      'prod',
    );
  });

  it('accepts GCLOUD_PROJECT as an alternative to GOOGLE_CLOUD_PROJECT, same as the warehouse query executor', () => {
    assert.equal(
      resolveOrchestrationTarget({ GCLOUD_PROJECT: 'growthos-g2w84', GROWTHOS_BIGQUERY_CORE_DATASET: 'growthos_core' }),
      'prod',
    );
  });

  it('treats an empty-string env var as not configured', () => {
    assert.equal(
      resolveOrchestrationTarget({ GOOGLE_CLOUD_PROJECT: '', GROWTHOS_BIGQUERY_CORE_DATASET: 'growthos_core' }),
      'dev',
    );
  });

  it('defaults to reading real process.env when no env object is passed', () => {
    const originalProject = process.env.GOOGLE_CLOUD_PROJECT;
    const originalGcloudProject = process.env.GCLOUD_PROJECT;
    const originalDataset = process.env.GROWTHOS_BIGQUERY_CORE_DATASET;
    delete process.env.GOOGLE_CLOUD_PROJECT;
    delete process.env.GCLOUD_PROJECT;
    delete process.env.GROWTHOS_BIGQUERY_CORE_DATASET;
    try {
      assert.equal(resolveOrchestrationTarget(), 'dev');
    } finally {
      if (originalProject !== undefined) process.env.GOOGLE_CLOUD_PROJECT = originalProject;
      if (originalGcloudProject !== undefined) process.env.GCLOUD_PROJECT = originalGcloudProject;
      if (originalDataset !== undefined) process.env.GROWTHOS_BIGQUERY_CORE_DATASET = originalDataset;
    }
  });
});
