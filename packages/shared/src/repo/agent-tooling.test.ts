import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Guards the repo-root agent tooling — the credential helpers and the per-toolchain
 * instruction files — from rotting silently. It lives in `packages/shared` because that
 * is where cross-cutting repo concerns already sit and because it is the package whose
 * suite always runs; the same "a test may read another package's files" posture
 * `core-table-catalog.test.ts` already takes for the dbt model catalogue.
 *
 * Two failures worth pinning:
 *
 * 1. A rename or move that leaves `CLAUDE.md`/`AGENTS.md`/`GEMINI.md` pointing at a helper
 *    that no longer exists. An agent that cannot find the helper goes looking for a token
 *    in a dotfile instead, which is exactly the habit this tooling exists to prevent.
 * 2. The Windows entrypoint bug: `Get-Command gcloud` resolves to the extensionless POSIX
 *    shell script the Cloud SDK ships alongside `gcloud.cmd`, which Windows cannot
 *    execute. It returns nothing and leaves `$LASTEXITCODE` unset, so every secret read
 *    looked like an authentication failure. The PowerShell helper must keep preferring the
 *    `.cmd`, and must keep treating an empty value as a failure rather than success.
 *
 * Deliberately never invokes `gcloud`: this runs in CI, which holds no Google credentials,
 * and a test that needs a live secret to pass is a test that ends up permanently skipped.
 */
const repoRoot = resolve(__dirname, '../../../..');
const read = (relativePath: string): string => readFileSync(resolve(repoRoot, relativePath), 'utf8');

describe('agent credential helpers', () => {
  it('ships both a POSIX and a PowerShell entrypoint, since agents run under either shell', () => {
    expect(existsSync(resolve(repoRoot, 'scripts/secrets/get-secret.sh'))).toBe(true);
    expect(existsSync(resolve(repoRoot, 'scripts/secrets/get-secret.ps1'))).toBe(true);
  });

  it('the PowerShell helper prefers gcloud.cmd over the extensionless script Windows cannot execute', () => {
    const powershell = read('scripts/secrets/get-secret.ps1');
    const candidates = powershell.match(/@\('([^']+)',\s*'([^']+)'\)/);
    expect(candidates?.[1]).toBe('gcloud.cmd');
    expect(candidates?.[2]).toBe('gcloud');
    expect(powershell).toContain('[string]::IsNullOrEmpty($value)');
  });

  it('both helpers read the same project and secret path, so one rotation reaches every shell', () => {
    for (const helper of ['scripts/secrets/get-secret.sh', 'scripts/secrets/get-secret.ps1']) {
      const source = read(helper);
      expect(source, helper).toContain('growthos-g2w84');
      expect(source, helper).toContain('GROWTHOS_GCP_PROJECT');
      expect(source, helper).toContain('secrets versions access latest');
    }
  });
});

describe('per-toolchain instruction files', () => {
  it('every agent instruction file points at the credentials doc and at a helper that exists', () => {
    for (const instructions of ['CLAUDE.md', 'AGENTS.md', 'GEMINI.md']) {
      const source = read(instructions);
      expect(source, instructions).toContain('docs/agent-credentials.md');
      expect(source, instructions).toContain('scripts/secrets/get-secret.sh');
    }
  });

  it('AGENTS.md and GEMINI.md defer to CLAUDE.md rather than growing a divergent copy of the rules', () => {
    for (const pointer of ['AGENTS.md', 'GEMINI.md']) {
      expect(read(pointer), pointer).toContain('CLAUDE.md');
    }
  });

  it('the credentials doc names secrets and never carries a value', () => {
    const credentialsDoc = read('docs/agent-credentials.md');
    expect(credentialsDoc).toContain('jira-api-token');
    // An Atlassian API token always starts with this prefix; a Google one with "ya29.".
    expect(credentialsDoc).not.toMatch(/ATATT[A-Za-z0-9]/);
    expect(credentialsDoc).not.toMatch(/ya29\.[A-Za-z0-9]/);
  });
});
