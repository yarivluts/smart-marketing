#!/usr/bin/env node
/**
 * Merge translation fragments into messages/en.json and messages/he.json.
 *
 * Several engineers/agents convert pages in parallel; editing the two 160KB message files
 * concurrently clobbers changes. Instead each change drops a fragment at
 * `messages/fragments/<anything>.json` shaped as:
 *
 *   { "en": { "Namespace": { "key": "..." } }, "he": { "Namespace": { "key": "..." } } }
 *
 * and runs this script, which takes an exclusive lock, deep-merges every fragment
 * (fragment values win), validates en/he key parity for the merged namespaces, rewrites the
 * two files with 2-space indentation, and deletes the merged fragments.
 *
 *   node scripts/merge-message-fragments.mjs
 */
import { closeSync, existsSync, mkdirSync, openSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const messagesDir = join(root, 'messages');
const fragmentsDir = join(messagesDir, 'fragments');
const lockPath = join(messagesDir, '.merge.lock');

function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function acquireLock() {
  const deadline = Date.now() + 60_000;
  for (;;) {
    try {
      return openSync(lockPath, 'wx');
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
      // Break stale locks (> 2 min old) left by a crashed run.
      try {
        if (Date.now() - statSync(lockPath).mtimeMs > 120_000) rmSync(lockPath, { force: true });
      } catch {
        /* raced with another remover */
      }
      if (Date.now() > deadline) throw new Error('Timed out waiting for messages/.merge.lock');
      sleep(150);
    }
  }
}

function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function deepMerge(target, source) {
  for (const [key, value] of Object.entries(source)) {
    if (isPlainObject(value) && isPlainObject(target[key])) {
      deepMerge(target[key], value);
    } else {
      target[key] = value;
    }
  }
  return target;
}

function keys(value, prefix = '') {
  if (!isPlainObject(value)) return [prefix];
  return Object.entries(value).flatMap(([k, v]) => keys(v, prefix ? `${prefix}.${k}` : k));
}

function main() {
  if (!existsSync(fragmentsDir)) mkdirSync(fragmentsDir, { recursive: true });
  const files = readdirSync(fragmentsDir).filter((f) => f.endsWith('.json'));
  if (files.length === 0) {
    console.log('[messages] no fragments to merge');
    return;
  }

  const fd = acquireLock();
  try {
    const enPath = join(messagesDir, 'en.json');
    const hePath = join(messagesDir, 'he.json');
    const en = JSON.parse(readFileSync(enPath, 'utf8'));
    const he = JSON.parse(readFileSync(hePath, 'utf8'));
    const merged = [];
    const problems = [];

    for (const file of files) {
      const path = join(fragmentsDir, file);
      const fragment = JSON.parse(readFileSync(path, 'utf8'));
      if (!isPlainObject(fragment.en) || !isPlainObject(fragment.he)) {
        problems.push(`${file}: must contain top-level "en" and "he" objects`);
        continue;
      }
      const enKeys = keys(fragment.en).sort();
      const heKeys = keys(fragment.he).sort();
      const missingHe = enKeys.filter((k) => !heKeys.includes(k));
      const missingEn = heKeys.filter((k) => !enKeys.includes(k));
      const empty = [...keys(fragment.en), ...keys(fragment.he)].filter((k) => k === '');
      if (missingHe.length || missingEn.length || empty.length) {
        problems.push(
          `${file}: en/he key mismatch (missing in he: ${missingHe.slice(0, 5).join(', ') || '-'}; missing in en: ${missingEn.slice(0, 5).join(', ') || '-'})`,
        );
        continue;
      }
      deepMerge(en, fragment.en);
      deepMerge(he, fragment.he);
      merged.push(path);
    }

    if (merged.length > 0) {
      writeFileSync(enPath, `${JSON.stringify(en, null, 2)}\n`);
      writeFileSync(hePath, `${JSON.stringify(he, null, 2)}\n`);
      for (const path of merged) rmSync(path);
    }
    console.log(`[messages] merged ${merged.length} fragment(s)`);
    if (problems.length > 0) {
      console.error(`[messages] skipped ${problems.length} fragment(s):\n  ${problems.join('\n  ')}`);
      process.exitCode = 1;
    }
  } finally {
    closeSync(fd);
    rmSync(lockPath, { force: true });
  }
}

main();
