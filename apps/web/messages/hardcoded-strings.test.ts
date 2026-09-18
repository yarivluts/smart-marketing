import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * A ratchet on hard-coded user-facing text in JSX (KAN-176).
 *
 * CLAUDE.md states, as a non-negotiable engineering rule: "**No hard-coded UI
 * strings.** All user-facing text lives in translation resource files
 * (`next-intl`, en + he). A lint rule enforces this."
 *
 * **No lint rule enforced it.** `apps/web/eslint.config.mjs` sets
 * `'react/jsx-no-literals': 'off'`, so the only mechanical check named in the
 * contract was disabled. Every agent run reads that sentence and reasonably
 * stops checking — which is how a single bulk UI commit introduced 183 of them
 * across the app without anything objecting.
 *
 * ## Why a ratchet and not the lint rule
 *
 * Turning `react/jsx-no-literals` on would fail CI immediately on work that is
 * already merged, and that rule is noisier than the policy: it flags
 * punctuation and whitespace as eagerly as prose. A rule that has to be
 * disabled to get anything done is how the original guarantee became decorative
 * in the first place.
 *
 * So this counts instead, and holds the line. The number may go DOWN and never
 * up. That makes the rule enforceable today, on a codebase that already
 * violates it, without a 183-file rewrite standing between the guarantee and
 * being true.
 *
 * ## What it matches, and what it deliberately does not
 *
 * A JSX text node containing letters, outside any `{...}` expression. That
 * catches `<span>Budget Guardrail Alerts</span>` and ignores
 * `<span>{t('budgetAlerts')}</span>`, which is exactly the distinction the
 * policy is about.
 *
 * It is a regex over source, not an AST pass, and it will miss things a parser
 * would catch — a string in a `title=` attribute, say. That is a deliberate
 * floor rather than a claim of completeness: an approximate check that runs and
 * holds is worth more than an exact one that is switched off. The comment
 * exists so nobody mistakes this count for the true total.
 */

const WEB_ROOT = path.resolve(__dirname, '..');
const SKIP_DIRECTORIES = new Set(['node_modules', '.next', 'dist', '.turbo', 'coverage', 'test-results', 'playwright-report']);

/** JSX text between tags that contains at least one letter and no interpolation. */
const JSX_TEXT = />\s*([A-Za-z][^<>{}]{3,}?)\s*</g;

function collectTsxFiles(dir: string, found: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRECTORIES.has(entry)) continue;
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      collectTsxFiles(full, found);
    } else if (entry.endsWith('.tsx') && !entry.endsWith('.test.tsx')) {
      found.push(full);
    }
  }
  return found;
}

function countHardcodedStrings(): { total: number; byDirectory: Record<string, number> } {
  const byDirectory: Record<string, number> = {};
  let total = 0;

  for (const file of collectTsxFiles(WEB_ROOT)) {
    const source = readFileSync(file, 'utf8');
    const matches = [...source.matchAll(JSX_TEXT)].filter((match) => !match[1].trim().startsWith('//'));
    if (matches.length === 0) continue;
    const relative = path.relative(WEB_ROOT, file).replace(/\\/g, '/');
    const key = relative.split('/').slice(0, 2).join('/');
    byDirectory[key] = (byDirectory[key] ?? 0) + matches.length;
    total += matches.length;
  }

  return { total, byDirectory };
}

/**
 * Measured on 2026-09-18, the day the disabled lint rule was found. Lower this
 * as strings move into `messages/en.json` + `he.json`; never raise it.
 *
 * Raising it to make a build pass would convert the one mechanical check that
 * survived into another decorative one, which is the failure this test exists
 * to record.
 */
const HARDCODED_STRING_BASELINE = 183;

describe('hard-coded UI strings (CLAUDE.md: "no hard-coded UI strings")', () => {
  it(`has no more than the ${HARDCODED_STRING_BASELINE} known at the time this ratchet was added`, () => {
    const { total, byDirectory } = countHardcodedStrings();

    // Reported per directory so a failure says WHERE to look rather than only
    // that a number moved.
    expect({ total, worstOffenders: Object.entries(byDirectory).sort((a, b) => b[1] - a[1]).slice(0, 5) }).toEqual({
      total: expect.any(Number),
      worstOffenders: expect.any(Array),
    });

    expect(
      total <= HARDCODED_STRING_BASELINE
        ? { withinBaseline: true }
        : {
            withinBaseline: false,
            total,
            baseline: HARDCODED_STRING_BASELINE,
            hint: 'Move the new strings into messages/en.json and he.json. Do not raise the baseline.',
            byDirectory,
          },
    ).toEqual({ withinBaseline: true });
  });

  /**
   * The count is the point, so a scan that silently stopped finding anything
   * would pass forever and guard nothing — the always-false-check shape this
   * codebase has been bitten by before.
   */
  it('actually scans a non-trivial number of files, so a broken scan cannot pass vacuously', () => {
    expect(collectTsxFiles(WEB_ROOT).length).toBeGreaterThan(50);
  });
});
