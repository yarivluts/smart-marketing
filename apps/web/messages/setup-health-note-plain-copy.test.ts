import { describe, expect, it } from 'vitest';
import en from './en.json';
import he from './he.json';

type Copy = Record<string, Record<string, string>>;

describe('setup health source note', () => {
  it.each([
    ['en', en],
    ['he', he],
  ] as const)('%s: does not send a newcomer to a tool by its code name', (_l, messages) => {
    const note = (messages as unknown as Copy).SetupHealth.sourceNote;
    expect(note).toBeTruthy();
    expect(note).not.toMatch(/audit_installation_gaps|MCP|_/);
  });
});
