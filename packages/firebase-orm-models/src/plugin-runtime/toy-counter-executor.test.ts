import { describe, expect, it } from 'vitest';
import { ToyCounterSourcePluginExecutor } from './toy-counter-executor';
import type { PluginRuntimeCredential } from './credential';

const CREDENTIAL: PluginRuntimeCredential = {
  token: 'fake-token',
  expiresAt: new Date().toISOString(),
  organizationId: 'org_1',
  projectId: 'proj_1',
  pluginInstallId: 'install_1',
  scopes: ['ingest:write'],
};

describe('ToyCounterSourcePluginExecutor', () => {
  it('starts from counter 0 when the cursor is null', async () => {
    const executor = new ToyCounterSourcePluginExecutor();
    const result = await executor.sync({
      organizationId: 'org_1',
      projectId: 'proj_1',
      pluginId: 'com.example.toy',
      config: {},
      credential: CREDENTIAL,
      cursor: null,
    });

    expect(result.kind).toBe('event');
    expect(result.records).toHaveLength(3);
    expect(result.records.map((r) => (r.properties as { counter: number }).counter)).toEqual([0, 1, 2]);
    expect(result.nextCursor).toBe('3');
  });

  it('resumes from a persisted cursor rather than starting over — "survives restart"', async () => {
    const executor = new ToyCounterSourcePluginExecutor();
    const result = await executor.sync({
      organizationId: 'org_1',
      projectId: 'proj_1',
      pluginId: 'com.example.toy',
      config: {},
      credential: CREDENTIAL,
      cursor: '6',
    });

    expect(result.records.map((r) => (r.properties as { counter: number }).counter)).toEqual([6, 7, 8]);
    expect(result.nextCursor).toBe('9');
  });

  it('honors a configured batch_size and event_name', async () => {
    const executor = new ToyCounterSourcePluginExecutor();
    const result = await executor.sync({
      organizationId: 'org_1',
      projectId: 'proj_1',
      pluginId: 'com.example.toy',
      config: { batch_size: 2, event_name: 'custom_tick' },
      credential: CREDENTIAL,
      cursor: null,
    });

    expect(result.records).toHaveLength(2);
    expect(result.records.every((r) => r.event === 'custom_tick')).toBe(true);
    expect(result.nextCursor).toBe('2');
  });

  it('falls back to the default batch size for an invalid configured value', async () => {
    const executor = new ToyCounterSourcePluginExecutor();
    const result = await executor.sync({
      organizationId: 'org_1',
      projectId: 'proj_1',
      pluginId: 'com.example.toy',
      config: { batch_size: -5 },
      credential: CREDENTIAL,
      cursor: null,
    });

    expect(result.records).toHaveLength(3);
  });

  it('produces unique, deterministic event_id values scoped to the plugin id', async () => {
    const executor = new ToyCounterSourcePluginExecutor();
    const result = await executor.sync({
      organizationId: 'org_1',
      projectId: 'proj_1',
      pluginId: 'com.example.toy',
      config: {},
      credential: CREDENTIAL,
      cursor: null,
    });

    expect(result.records.map((r) => r.event_id)).toEqual(['com.example.toy:0', 'com.example.toy:1', 'com.example.toy:2']);
  });
});
