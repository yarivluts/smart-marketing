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
