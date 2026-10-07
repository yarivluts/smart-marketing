import { readFileSync } from 'node:fs';
import { builtinModules } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { SDK_VERSION } from './constants';

const here = dirname(fileURLToPath(import.meta.url));

/** The modules a file loads at run time (`import type` / `export type` are erased by tsc). */
function runtimeSpecifiers(file: string): string[] {
  const source = readFileSync(join(here, file), 'utf8');
  const pattern = /^\s*(?:import|export)\s+(?!type\b)[^;]*?\bfrom\s+'([^']+)'/gms;
  return [...source.matchAll(pattern)].map((match) => match[1]);
}

/** Every module reachable from `entry`, following the package's own relative imports. */
function reachable(entry: string): { files: string[]; external: string[] } {
  const files = new Set<string>();
  const external = new Set<string>();
  const visit = (file: string) => {
    if (files.has(file)) return;
    files.add(file);
    for (const specifier of runtimeSpecifiers(file)) {
      if (specifier.startsWith('./')) visit(specifier.slice(2).replace(/\.js$/, '.ts'));
      else external.add(specifier);
    }
  };
  visit(entry);
  return { files: [...files].sort(), external: [...external].sort() };
}

const NODE_BUILTINS = new Set(builtinModules.flatMap((name) => [name, `node:${name}`]));

describe('@growthos/node/relay on edge runtimes', () => {
  it('loads no Node built-in, so Cloudflare Pages / Vercel Edge can bundle it', () => {
    const { files, external } = reachable('relay.ts');
    expect(files).toContain('constants.ts');
    expect(files).not.toContain('client.ts');
    expect(external.filter((specifier) => NODE_BUILTINS.has(specifier))).toEqual([]);
  });

  it('the package root does load node:crypto - the reason the relay has its own entry', () => {
    expect(reachable('index.ts').external).toContain('node:crypto');
  });
});

describe('SDK_VERSION', () => {
  it('matches package.json, so the user agent names the version actually installed', () => {
    const pkg = JSON.parse(readFileSync(join(here, '..', 'package.json'), 'utf8')) as {
      version: string;
    };
    expect(SDK_VERSION).toBe(pkg.version);
  });
});
