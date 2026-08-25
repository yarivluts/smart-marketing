import { describe, expect, it } from 'vitest';
import type { SupportLeaderboardResult } from '@growthos/firebase-orm-models';
import { toSupportLeaderboardView } from './support-view';

describe('toSupportLeaderboardView', () => {
  it('resolves each row against the people map, preserving order and pass-through metrics', () => {
    const result: SupportLeaderboardResult = {
      ticketsOpened: 4,
      openBacklog: 1,
      rows: [
        { agentOrgPersonId: 'agent-1', ticketsResolved: 2, avgFirstResponseSeconds: 450, avgResolutionSeconds: 5400, avgCsatScore: 4 },
        { agentOrgPersonId: 'agent-2', ticketsResolved: 1, avgFirstResponseSeconds: 120, avgResolutionSeconds: 1800, avgCsatScore: 4 },
      ],
    };
    const peopleById = new Map([
      ['agent-1', { name: 'Ada', photoUrl: 'https://example.com/ada.png' }],
      ['agent-2', { name: 'Grace', photoUrl: null }],
    ]);

    expect(toSupportLeaderboardView(result, peopleById)).toEqual({
      ticketsOpened: 4,
      openBacklog: 1,
      rows: [
        { agentOrgPersonId: 'agent-1', name: 'Ada', photoUrl: 'https://example.com/ada.png', ticketsResolved: 2, avgFirstResponseSeconds: 450, avgResolutionSeconds: 5400, avgCsatScore: 4 },
        { agentOrgPersonId: 'agent-2', name: 'Grace', photoUrl: null, ticketsResolved: 1, avgFirstResponseSeconds: 120, avgResolutionSeconds: 1800, avgCsatScore: 4 },
      ],
    });
  });

  it('falls back to the raw agent id when the person was since removed from the org registry', () => {
    const result: SupportLeaderboardResult = {
      ticketsOpened: 1,
      openBacklog: 0,
      rows: [{ agentOrgPersonId: 'agent-removed', ticketsResolved: 1, avgFirstResponseSeconds: null, avgResolutionSeconds: null, avgCsatScore: null }],
    };

    const view = toSupportLeaderboardView(result, new Map());
    expect(view.rows[0]).toMatchObject({ name: 'agent-removed', photoUrl: null });
  });
});
