import { describe, expect, it } from 'vitest';
import type { SupportLeaderboardResult } from '@growthos/firebase-orm-models';
import { formatDurationSeconds, toSupportLeaderboardView } from './support-view';

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

describe('formatDurationSeconds', () => {
  it('rounds to whole seconds under a minute', () => {
    expect(formatDurationSeconds(45.4)).toEqual({ value: 45, unitKey: 'durationSeconds' });
  });

  it('rounds to whole minutes under an hour', () => {
    expect(formatDurationSeconds(300)).toEqual({ value: 5, unitKey: 'durationMinutes' });
  });

  it('rounds to one decimal place of hours at and above an hour', () => {
    expect(formatDurationSeconds(5400)).toEqual({ value: 1.5, unitKey: 'durationHours' });
  });

  it('never bakes a unit word into the returned value — only a translation-lookup key', () => {
    const { value } = formatDurationSeconds(120);
    expect(typeof value).toBe('number');
  });
});
