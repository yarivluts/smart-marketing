import { describe, expect, it } from 'vitest';
import en from './en.json';
import he from './he.json';

describe('Access page AI-app connection copy avoids developer words', () => {
  for (const [name, lang] of [
    ['en', en],
    ['he', he],
  ] as const) {
    it(`heading, intro, empty state and counters have no "MCP", "client" or "token" (${name})`, () => {
      const k = lang.ApiKeys;
      const texts = [
        k.mcpConnectionsHeading,
        k.mcpEndpointIntro,
        k.noMcpConnections,
        k.mcpConnectionPendingLabel,
        k.mcpConnectionRevokedDueToTokenReuseLabel,
        k.kpiMcp,
      ];
      for (const text of texts) {
        expect(text).not.toMatch(/MCP|headless|refresh token|טוקן|לקוח MCP/i);
      }
      expect(k.mcpEndpointIntro).toMatch(name === 'en' ? /cannot change anything/ : /לא לשנות דבר/);
    });
  }
});
