import { describe, expect, it } from 'vitest';
import { aggregateSupportLeaderboard } from './support.service';
import type { RawRecordModel } from '../models/raw-record.model';

/**
 * Pure-function tests for `aggregateSupportLeaderboard` (KAN-90) — no
 * Firestore access, same "brute-force edge cases without the emulator"
 * posture `rep-collection-aggregate.test.ts` (KAN-88) establishes for its
 * own pure aggregator.
 */

function ticketEvent(properties: Record<string, unknown>): RawRecordModel {
  return { payload: { event: 'support_ticket_event', event_id: 'evt', ts: '2026-09-01T00:00:00.000Z', properties } } as RawRecordModel;
}

describe('aggregateSupportLeaderboard', () => {
  it('counts distinct opened/resolved tickets and computes the open backlog', () => {
    const result = aggregateSupportLeaderboard([
      ticketEvent({ ticket_id: 't1', stage: 'opened' }),
      ticketEvent({ ticket_id: 't1', stage: 'resolved', agent_org_person_id: 'agent_1' }),
      ticketEvent({ ticket_id: 't2', stage: 'opened' }),
    ]);

    expect(result.ticketsOpened).toBe(2);
    expect(result.openBacklog).toBe(1);
  });

  it('buckets resolved tickets by agent, averaging first-response/resolution/CSAT per agent', () => {
    const result = aggregateSupportLeaderboard([
      ticketEvent({ ticket_id: 't1', stage: 'resolved', agent_org_person_id: 'agent_1', first_response_seconds: 300, resolution_seconds: 3600, csat_score: 5 }),
      ticketEvent({ ticket_id: 't2', stage: 'resolved', agent_org_person_id: 'agent_1', first_response_seconds: 600, resolution_seconds: 7200, csat_score: 3 }),
      ticketEvent({ ticket_id: 't3', stage: 'resolved', agent_org_person_id: 'agent_2', first_response_seconds: 120, resolution_seconds: 1800, csat_score: 4 }),
    ]);

    expect(result.rows).toEqual([
      { agentOrgPersonId: 'agent_1', ticketsResolved: 2, avgFirstResponseSeconds: 450, avgResolutionSeconds: 5400, avgCsatScore: 4 },
      { agentOrgPersonId: 'agent_2', ticketsResolved: 1, avgFirstResponseSeconds: 120, avgResolutionSeconds: 1800, avgCsatScore: 4 },
    ]);
  });

  it('sorts rows highest-ticketsResolved-first', () => {
    const result = aggregateSupportLeaderboard([
      ticketEvent({ ticket_id: 't1', stage: 'resolved', agent_org_person_id: 'agent_low' }),
      ticketEvent({ ticket_id: 't2', stage: 'resolved', agent_org_person_id: 'agent_high' }),
      ticketEvent({ ticket_id: 't3', stage: 'resolved', agent_org_person_id: 'agent_high' }),
    ]);

    expect(result.rows.map((row) => row.agentOrgPersonId)).toEqual(['agent_high', 'agent_low']);
  });

  it('ignores a resolved-stage event with no agent_org_person_id for per-agent rows, but still counts it toward the backlog math', () => {
    const result = aggregateSupportLeaderboard([ticketEvent({ ticket_id: 't1', stage: 'opened' }), ticketEvent({ ticket_id: 't1', stage: 'resolved' })]);

    expect(result.ticketsOpened).toBe(1);
    expect(result.openBacklog).toBe(0);
    expect(result.rows).toEqual([]);
  });

  it('never reports a negative open backlog even if a resolved event lands with no matching opened event (a backfill gap)', () => {
    const result = aggregateSupportLeaderboard([ticketEvent({ ticket_id: 't1', stage: 'resolved', agent_org_person_id: 'agent_1' })]);

    expect(result.ticketsOpened).toBe(0);
    expect(result.openBacklog).toBe(0);
  });

  it('ignores malformed records (missing ticket_id or an unrecognized stage) without crashing', () => {
    const result = aggregateSupportLeaderboard([
      ticketEvent({ stage: 'opened' }),
      ticketEvent({ ticket_id: 't1', stage: 'in_progress' }),
      { payload: { properties: null } } as RawRecordModel,
      { payload: { properties: 'not-an-object' } } as RawRecordModel,
    ]);

    expect(result.ticketsOpened).toBe(0);
    expect(result.openBacklog).toBe(0);
    expect(result.rows).toEqual([]);
  });

  it('treats a non-finite first_response_seconds/resolution_seconds/csat_score as absent rather than crashing or corrupting the average', () => {
    const result = aggregateSupportLeaderboard([
      ticketEvent({ ticket_id: 't1', stage: 'resolved', agent_org_person_id: 'agent_1', first_response_seconds: 'not-a-number', csat_score: 5 }),
    ]);

    expect(result.rows).toEqual([{ agentOrgPersonId: 'agent_1', ticketsResolved: 1, avgFirstResponseSeconds: null, avgResolutionSeconds: null, avgCsatScore: 5 }]);
  });
});
