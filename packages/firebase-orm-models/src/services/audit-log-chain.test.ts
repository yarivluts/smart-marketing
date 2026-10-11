import 'reflect-metadata';
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { buildHashableContent, computeEntryHash, verifyAuditLogChain, type VerifiableAuditLogEntry } from './audit-log.service';

/**
 * Pure tests for `verifyAuditLogChain` - no emulator. The fixtures mirror prod org
 * JGTxet9aGXV6xUPWYidR (ids, actions and millisecond gaps copied from it), where the previous
 * verifier reported "tampered" at tgYhv3hJTivCYu8rTFCV: a sibling appended 4ms after another, both
 * linking onto the same `plugin.install` entry.
 */

interface FixtureInput {
  action: string;
  createdAt: string;
  prev: VerifiableAuditLogEntry | '';
  seq?: number;
  summary?: string;
}

function makeEntry(id: string, input: FixtureInput): VerifiableAuditLogEntry {
  const content = buildHashableContent({
    organization_id: 'JGTxet9aGXV6xUPWYidR',
    actor_type: 'user',
    actor_id: 'user-1',
    action: input.action,
    target_type: input.action.split('.')[0],
    target_id: `target-${id}`,
    summary: input.summary ?? `summary ${id}`,
    created_at: input.createdAt,
    ...(input.seq !== undefined ? { seq: input.seq } : {}),
    prev_entry_hash: input.prev === '' ? '' : input.prev.entry_hash,
  });
  return { id, ...content, entry_hash: computeEntryHash(content) };
}

/** What the verifier did before this fix: compare each entry with whichever entry precedes it by `created_at`. */
function previousAdjacencyVerifier(entries: VerifiableAuditLogEntry[]): string | undefined {
  const ordered = [...entries].sort((a, b) => (a.created_at < b.created_at ? -1 : 1));
  return ordered.find((entry, index) => index > 0 && entry.prev_entry_hash !== ordered[index - 1].entry_hash)?.id;
}

function prodForkFixture() {
  const genesis = makeEntry('5IkYuHE0eOUqYJtO1fkS', { action: 'onboarding.start', createdAt: '2026-08-16T19:49:57.817Z', prev: '' });
  const manifest = makeEntry('s7dzA5XuStYfpZjrdnRh', { action: 'plugin_manifest.register', createdAt: '2026-08-16T19:50:09.289Z', prev: genesis });
  const install = makeEntry('jiqRyCSe68Ly3bLsdNg8', { action: 'plugin.install', createdAt: '2026-08-16T19:50:09.408Z', prev: manifest });
  // Registered concurrently (`Promise.all` over a pack's metrics): both read `install` as the head.
  const first = makeEntry('SvPQ2D8Ge0OCF2iY8BaV', { action: 'metric_def.register', createdAt: '2026-08-16T19:50:09.512Z', prev: install });
  const second = makeEntry('tgYhv3hJTivCYu8rTFCV', { action: 'metric_def.register', createdAt: '2026-08-16T19:50:09.516Z', prev: install });
  const third = makeEntry('QpQwjsThbxZvyWhTsVuV', { action: 'metric_def.register', createdAt: '2026-08-16T19:50:09.649Z', prev: second });
  const board = makeEntry('Zqkz7vE6girASpghxZka', { action: 'board.create', createdAt: '2026-08-16T19:50:09.798Z', prev: third });
  return { genesis, manifest, install, first, second, third, board, all: [genesis, manifest, install, first, second, third, board] };
}

describe('verifyAuditLogChain: known writer conditions are not tampering', () => {
  it('reports the prod concurrent-append fork at tgYhv3hJTivCYu8rTFCV as a fork, not a break', () => {
    const { all, install, first, second } = prodForkFixture();

    // The regression: the previous verifier flagged exactly this entry.
    expect(previousAdjacencyVerifier(all)).toBe('tgYhv3hJTivCYu8rTFCV');

    const result = verifyAuditLogChain(all);
    expect(result.valid).toBe(true);
    expect(result.reason).toBeUndefined();
    expect(result.brokenAtEntryId).toBeUndefined();
    expect(result.entryCount).toBe(7);
    expect(result.forks).toEqual([
      {
        parent: { id: install.id, action: 'plugin.install', createdAt: install.created_at, actorType: 'user', actorId: 'user-1' },
        branches: [
          { id: first.id, action: 'metric_def.register', createdAt: first.created_at, actorType: 'user', actorId: 'user-1' },
          { id: second.id, action: 'metric_def.register', createdAt: second.created_at, actorType: 'user', actorId: 'user-1' },
        ],
      },
    ]);
  });

  it('does not depend on input order', () => {
    const { all } = prodForkFixture();
    expect(verifyAuditLogChain([...all].reverse())).toEqual(verifyAuditLogChain(all));
  });

  it('accepts a child timestamped before its parent (writers on hosts whose clocks disagree)', () => {
    // Prod: an `mcp.tool_call` from apps/api stamped 15:16:48, then two `api_key.revoke` entries
    // from apps/web stamped 15:16:04 that were appended after it and link onto it.
    const genesis = makeEntry('g', { action: 'organization.create', createdAt: '2026-09-16T15:00:00.000Z', prev: '' });
    const toolCall = makeEntry('gnNRZz6SV3MwjNwUilr4', { action: 'mcp.tool_call', createdAt: '2026-09-16T15:16:48.189Z', prev: genesis });
    const revokeA = makeEntry('hfgyuBhi278Vl5Jg0232', { action: 'api_key.revoke', createdAt: '2026-09-16T15:16:04.320Z', prev: toolCall });
    const revokeB = makeEntry('D5jeup6gHeKr3VzgZiv8', { action: 'api_key.revoke', createdAt: '2026-09-16T15:16:04.449Z', prev: toolCall });

    expect(previousAdjacencyVerifier([genesis, toolCall, revokeA, revokeB])).toBeDefined();
    const result = verifyAuditLogChain([genesis, toolCall, revokeA, revokeB]);
    expect(result.valid).toBe(true);
    expect(result.forks).toHaveLength(1);
    expect(result.forks[0].parent?.id).toBe('gnNRZz6SV3MwjNwUilr4');
    expect(result.forks[0].branches.map((branch) => branch.id)).toEqual(['hfgyuBhi278Vl5Jg0232', 'D5jeup6gHeKr3VzgZiv8']);
  });

  it('reports several "first" entries as a fork with no parent', () => {
    const a = makeEntry('a', { action: 'organization.create', createdAt: '2026-01-01T00:00:00.000Z', prev: '' });
    const b = makeEntry('b', { action: 'membership.role_granted', createdAt: '2026-01-01T00:00:00.001Z', prev: '' });
    const result = verifyAuditLogChain([a, b]);
    expect(result.valid).toBe(true);
    expect(result.forks).toEqual([{ branches: [expect.objectContaining({ id: 'a' }), expect.objectContaining({ id: 'b' })] }]);
  });

  it('reports a linear chain as valid with no forks, and an empty log as valid', () => {
    const genesis = makeEntry('g', { action: 'organization.create', createdAt: '2026-01-01T00:00:00.000Z', prev: '' });
    const next = makeEntry('n', { action: 'board.create', createdAt: '2026-01-01T00:00:01.000Z', prev: genesis });
    expect(verifyAuditLogChain([genesis, next])).toEqual({ valid: true, entryCount: 2, forks: [] });
    expect(verifyAuditLogChain([])).toEqual({ valid: true, entryCount: 0, forks: [] });
  });
});

describe('verifyAuditLogChain: real modifications are still caught', () => {
  it('reports a chain_break when an entry in the middle was deleted', () => {
    const { all, install } = prodForkFixture();
    const result = verifyAuditLogChain(all.filter((entry) => entry.id !== install.id));
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('chain_break');
    // The oldest entry whose parent is gone - the first of install's two children.
    expect(result.brokenAtEntryId).toBe('SvPQ2D8Ge0OCF2iY8BaV');
    expect(result.brokenEntry).toEqual({
      id: 'SvPQ2D8Ge0OCF2iY8BaV',
      action: 'metric_def.register',
      createdAt: '2026-08-16T19:50:09.512Z',
      actorType: 'user',
      actorId: 'user-1',
    });
  });

  it('reports a hash_mismatch on an entry edited in place, without blaming its children', () => {
    const { all, third } = prodForkFixture();
    const edited = all.map((entry) => (entry.id === third.id ? { ...entry, summary: 'rewritten' } : entry));
    const result = verifyAuditLogChain(edited);
    expect(result).toMatchObject({ valid: false, reason: 'hash_mismatch', brokenAtEntryId: third.id });
  });

  it('reports a chain_break at the child when a parent was edited and re-hashed', () => {
    const { all, third, board } = prodForkFixture();
    const rehashed = all.map((entry) => {
      if (entry.id !== third.id) return entry;
      const content = buildHashableContent({ ...entry, summary: 'rewritten' });
      return { ...entry, summary: 'rewritten', entry_hash: computeEntryHash(content) };
    });
    const result = verifyAuditLogChain(rehashed);
    expect(result).toMatchObject({ valid: false, reason: 'chain_break', brokenAtEntryId: board.id });
  });

  it('reports the oldest failure when there are several', () => {
    const { all, first, board } = prodForkFixture();
    const tampered = all.map((entry) => (entry.id === first.id || entry.id === board.id ? { ...entry, summary: 'x' } : entry));
    expect(verifyAuditLogChain(tampered).brokenAtEntryId).toBe(first.id);
  });
});

describe('verifyAuditLogChain: seq', () => {
  it('accepts seq-carrying entries continuing a legacy chain (seq 1 under a parent without one)', () => {
    const { all, board } = prodForkFixture();
    const s1 = makeEntry('s1', { action: 'board.update', createdAt: '2026-10-10T10:00:00.000Z', prev: board, seq: 1 });
    // Stamped earlier than s1 by a host whose clock runs behind - irrelevant, it links by seq.
    const s2 = makeEntry('s2', { action: 'board.update', createdAt: '2026-10-10T09:59:30.000Z', prev: s1, seq: 2 });
    expect(verifyAuditLogChain([...all, s1, s2])).toMatchObject({ valid: true, entryCount: 9 });
  });

  it('reports a chain_break when an entry was re-hashed with a seq that does not follow its parent', () => {
    const genesis = makeEntry('g', { action: 'organization.create', createdAt: '2026-01-01T00:00:00.000Z', prev: '', seq: 1 });
    const forged = makeEntry('f', { action: 'board.create', createdAt: '2026-01-01T00:00:01.000Z', prev: genesis, seq: 5 });
    expect(verifyAuditLogChain([genesis, forged])).toMatchObject({ valid: false, reason: 'chain_break', brokenAtEntryId: 'f' });
  });
});

describe('entry hash compatibility', () => {
  it('hashes an entry without seq exactly as entries written before seq existed', () => {
    // Independent of `canonicalize`: the canonical JSON is spelled out by hand, keys sorted.
    const content = buildHashableContent({
      organization_id: 'o',
      actor_type: 'user',
      actor_id: 'u',
      action: 'a.b',
      target_type: 't',
      target_id: 'x',
      summary: 's',
      after: { z: 1, a: 2 },
      created_at: '2026-08-16T19:50:09.516Z',
      prev_entry_hash: '',
    });
    const canonical =
      '{"action":"a.b","actor_id":"u","actor_type":"user","after":{"a":2,"z":1},"created_at":"2026-08-16T19:50:09.516Z","organization_id":"o","prev_entry_hash":"","summary":"s","target_id":"x","target_type":"t"}';
    expect(computeEntryHash(content)).toBe(createHash('sha256').update(canonical).digest('hex'));
  });

  it('commits to seq when present', () => {
    const base = { organization_id: 'o', actor_type: 'user' as const, actor_id: 'u', action: 'a', target_type: 't', target_id: 'x', summary: 's', created_at: 'c', prev_entry_hash: '' };
    expect(computeEntryHash(buildHashableContent({ ...base, seq: 1 }))).not.toBe(computeEntryHash(buildHashableContent({ ...base, seq: 2 })));
    expect(computeEntryHash(buildHashableContent({ ...base, seq: 1 }))).not.toBe(computeEntryHash(buildHashableContent(base)));
  });
});
