import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const base = join(__dirname, '../../app/[locale]/orgs/[orgId]/projects/[projectId]');

describe('run summaries show a readable start time', () => {
  it.each(['plugins/page.tsx', 'ingest-health/page.tsx'])('%s formats startedAt instead of printing the raw timestamp', (file) => {
    const source = readFileSync(join(base, file), 'utf8');
    expect(source).toContain('formatReadableDateTime(run.startedAt, locale)');
    expect(source).not.toMatch(/startedAt: run\.startedAt/);
  });
});
