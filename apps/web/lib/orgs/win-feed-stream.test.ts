import { beforeAll, describe, expect, it } from 'vitest';
import {
  createOrganizationWithOwner,
  createProject,
  createWinRule,
  ensureUserForFirebaseSession,
  evaluateRecordAgainstWinRules,
  registerSchemaDefinition,
} from '@growthos/firebase-orm-models';
import { ensureFirestoreOrm } from '@/lib/firebase/firestore';
import { createWinFeedStream } from './win-feed-stream';
import type { WinEventFeedItem } from './win-rule-view';

beforeAll(async () => {
  process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8090';
  process.env.FIREBASE_PROJECT_ID = 'demo-growthos-test';
  await ensureFirestoreOrm();
});

function unique(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2)}`;
}

function uniqueEmail(prefix: string): string {
  return `${unique(prefix)}@example.com`;
}

async function setupProjectWithRule(orgName: string) {
  const owner = await ensureUserForFirebaseSession({ firebaseUid: unique('uid'), email: uniqueEmail('owner') });
  const { organization } = await createOrganizationWithOwner({ name: orgName, ownerUserId: owner.id });
  const { project, environments } = await createProject({ organizationId: organization.id, name: 'Website' });
  await registerSchemaDefinition({
    organizationId: organization.id,
    projectId: project.id,
    kind: 'event',
    name: 'signup',
    fields: [{ name: 'plan', type: 'string', isRequired: false, isPii: false, isIdentityKey: false }],
    createdByUserId: owner.id,
  });
  await createWinRule({
    organizationId: organization.id,
    projectId: project.id,
    name: 'New signup',
    schemaName: 'signup',
    filters: [],
    createdByUserId: owner.id,
  });
  return { organization, project, environmentId: environments[0].id };
}

/** Two rules watching the same schema — one `evaluateRecordAgainstWinRules` call against a matching record fires both, sharing one millisecond-resolution `created_at` (the same-timestamp collision `listWinEventsSince`'s own doc comment describes). */
async function setupProjectWithTwoRulesOnSameSchema(orgName: string) {
  const owner = await ensureUserForFirebaseSession({ firebaseUid: unique('uid'), email: uniqueEmail('owner') });
  const { organization } = await createOrganizationWithOwner({ name: orgName, ownerUserId: owner.id });
  const { project, environments } = await createProject({ organizationId: organization.id, name: 'Website' });
  await registerSchemaDefinition({
    organizationId: organization.id,
    projectId: project.id,
    kind: 'event',
    name: 'order_completed',
    fields: [{ name: 'amount', type: 'number', isRequired: false, isPii: false, isIdentityKey: false }],
    createdByUserId: owner.id,
  });
  for (const name of ['Any order', 'Big order']) {
    await createWinRule({
      organizationId: organization.id,
      projectId: project.id,
      name,
      schemaName: 'order_completed',
      filters: name === 'Big order' ? [{ field: 'properties.amount', operator: '>', value: '100' }] : [],
      createdByUserId: owner.id,
    });
  }
  return { organization, project, environmentId: environments[0].id };
}

/** Reads SSE chunks off `stream` until `predicate` matches decoded text so far, or `timeoutMs` elapses. */
async function readUntil(stream: ReadableStream<Uint8Array>, predicate: (text: string) => boolean, timeoutMs = 5000): Promise<string> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let text = '';
  const deadline = Date.now() + timeoutMs;
  try {
    while (Date.now() < deadline) {
      const { value, done } = await reader.read();
      if (done) {
        break;
      }
      text += decoder.decode(value, { stream: true });
      if (predicate(text)) {
        return text;
      }
    }
  } finally {
    await reader.cancel().catch(() => undefined);
  }
  throw new Error(`readUntil timed out; accumulated text so far: ${text}`);
}

describe('createWinFeedStream', () => {
  it('flushes a win that was already fired before the cursor was captured', async () => {
    const { organization, project, environmentId } = await setupProjectWithRule('Win Feed Stream Org');
    const before = new Date(Date.now() - 1000).toISOString();

    await evaluateRecordAgainstWinRules({
      organizationId: organization.id,
      projectId: project.id,
      environmentId,
      kind: 'event',
      schemaName: 'signup',
      clientId: 'evt_1',
      payload: {},
      rawRecordId: 'raw_1',
      occurredAt: new Date().toISOString(),
    });

    const controller = new AbortController();
    const stream = createWinFeedStream({
      organizationId: organization.id,
      projectId: project.id,
      since: before,
      signal: controller.signal,
      pollIntervalMs: 20,
      maxDurationMs: 4000,
    });

    const text = await readUntil(stream, (accumulated) => accumulated.includes('event: win'));
    controller.abort();

    expect(text).toContain('retry: 2000');
    expect(text).toContain('event: win');
    const dataLine = text.split('\n').find((line) => line.startsWith('data: '));
    expect(dataLine).toBeTruthy();
    const item = JSON.parse(dataLine!.slice('data: '.length)) as WinEventFeedItem;
    expect(item.schemaName).toBe('signup');
    expect(item.clientId).toBe('evt_1');

    const idLine = text.split('\n').find((line) => line.startsWith('id: '));
    expect(idLine).toBe(`id: ${item.createdAt}`);
  });

  it('flushes every win sharing the same created_at exactly once, then dedupes a same-cursor requery', async () => {
    const { organization, project, environmentId } = await setupProjectWithTwoRulesOnSameSchema('Win Feed Stream Collision Org');
    const before = new Date(Date.now() - 1000).toISOString();

    await evaluateRecordAgainstWinRules({
      organizationId: organization.id,
      projectId: project.id,
      environmentId,
      kind: 'event',
      schemaName: 'order_completed',
      clientId: 'evt_1',
      payload: { properties: { amount: 500 } },
      rawRecordId: 'raw_1',
      occurredAt: new Date().toISOString(),
    });

    const controller = new AbortController();
    const stream = createWinFeedStream({
      organizationId: organization.id,
      projectId: project.id,
      since: before,
      signal: controller.signal,
      pollIntervalMs: 20,
      maxDurationMs: 4000,
    });

    // Two rules matched -> two win events with an identical `created_at`. Keep reading past the
    // point both have arrived, through several more poll ticks (still well inside `maxDurationMs`),
    // to prove a same-cursor requery doesn't re-send either of them.
    const reader = stream.getReader();
    const decoder = new TextDecoder();
    let text = '';
    const deadline = Date.now() + 1000;
    while (Date.now() < deadline) {
      const { value, done } = await reader.read();
      if (done) {
        break;
      }
      text += decoder.decode(value, { stream: true });
    }
    controller.abort();
    await reader.cancel().catch(() => undefined);

    expect(text.split('event: win').length - 1).toBe(2);
    const winRuleNames = text
      .split('\n')
      .filter((line) => line.startsWith('data: '))
      .map((line) => (JSON.parse(line.slice('data: '.length)) as WinEventFeedItem).winRuleName)
      .sort();
    expect(winRuleNames).toEqual(['Any order', 'Big order']);
  });

  it('never flushes a win that occurred before the cursor', async () => {
    const { organization, project, environmentId } = await setupProjectWithRule('Win Feed Stream No Backlog Org');

    await evaluateRecordAgainstWinRules({
      organizationId: organization.id,
      projectId: project.id,
      environmentId,
      kind: 'event',
      schemaName: 'signup',
      clientId: 'evt_1',
      payload: {},
      rawRecordId: 'raw_1',
      occurredAt: new Date().toISOString(),
    });
    const after = new Date(Date.now() + 1000).toISOString();

    const controller = new AbortController();
    const stream = createWinFeedStream({
      organizationId: organization.id,
      projectId: project.id,
      since: after,
      signal: controller.signal,
      pollIntervalMs: 20,
      maxDurationMs: 300,
    });

    const text = await readUntil(stream, () => false, 1000).catch((error) => (error as Error).message);
    controller.abort();

    expect(text).toContain('heartbeat');
    expect(text).not.toContain('event: win');
  });

  it('closes promptly, not spinning for the full maxDurationMs, when the project does not exist', async () => {
    const owner = await ensureUserForFirebaseSession({ firebaseUid: unique('uid'), email: uniqueEmail('owner') });
    const { organization } = await createOrganizationWithOwner({ name: 'Win Feed Stream Missing Project Org', ownerUserId: owner.id });

    const controller = new AbortController();
    const stream = createWinFeedStream({
      organizationId: organization.id,
      projectId: 'does-not-exist',
      since: new Date().toISOString(),
      signal: controller.signal,
      pollIntervalMs: 20,
      maxDurationMs: 60_000,
    });

    const reader = stream.getReader();
    const start = Date.now();
    let done = false;
    while (!done && Date.now() - start < 5000) {
      done = (await reader.read()).done;
    }
    controller.abort();
    expect(done).toBe(true);
    expect(Date.now() - start).toBeLessThan(5000);
  });

  it('stops enqueueing once the caller aborts', async () => {
    const { organization, project } = await setupProjectWithRule('Win Feed Stream Abort Org');
    const controller = new AbortController();
    const stream = createWinFeedStream({
      organizationId: organization.id,
      projectId: project.id,
      since: new Date().toISOString(),
      signal: controller.signal,
      pollIntervalMs: 20,
      maxDurationMs: 5000,
    });

    const reader = stream.getReader();
    await reader.read();
    controller.abort();

    let done = false;
    for (let attempt = 0; attempt < 50 && !done; attempt++) {
      done = (await reader.read()).done;
    }
    expect(done).toBe(true);
  });
});
