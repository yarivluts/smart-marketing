import { describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { parseCreateGoalRequestBody } from './parse-goal-fields';

function request(body?: unknown): NextRequest {
  return new NextRequest('https://growthos.test/x', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

const validMaximizeGoal = {
  name: 'Q3 signups',
  metricName: 'signups',
  direction: 'maximize',
  targetValue: 1000,
  startDate: '2026-07-01',
  deadline: '2026-09-30',
  rhythm: 'even',
  ownerPersonId: 'person-1',
};

describe('parseCreateGoalRequestBody', () => {
  it('accepts a well-formed maximize goal request', async () => {
    const parsed = await parseCreateGoalRequestBody(request(validMaximizeGoal));
    expect(parsed).toEqual(validMaximizeGoal);
  });

  it('accepts a well-formed range goal request, with rangeMin/rangeMax instead of targetValue', async () => {
    const body = {
      name: 'Healthy CAC band',
      metricName: 'cost_per_signup',
      direction: 'range',
      rangeMin: 20,
      rangeMax: 40,
      startDate: '2026-07-01',
      deadline: '2026-09-30',
      rhythm: 'work_week_weekend',
      ownerPersonId: 'person-2',
    };
    const parsed = await parseCreateGoalRequestBody(request(body));
    expect(parsed).toEqual(body);
  });

  it('omits rangeMin/rangeMax from the parsed result of a request that never sent them, rather than including them as undefined', async () => {
    const parsed = await parseCreateGoalRequestBody(request(validMaximizeGoal));
    expect(parsed.error).toBeUndefined();
    expect('rangeMin' in parsed).toBe(false);
    expect('rangeMax' in parsed).toBe(false);
  });

  it('rejects invalid JSON', async () => {
    const badRequest = new NextRequest('https://growthos.test/x', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{not json' });
    expect((await parseCreateGoalRequestBody(badRequest)).error?.status).toBe(400);
  });

  it('rejects a missing or empty name', async () => {
    expect((await parseCreateGoalRequestBody(request({ ...validMaximizeGoal, name: undefined }))).error?.status).toBe(400);
    expect((await parseCreateGoalRequestBody(request({ ...validMaximizeGoal, name: '   ' }))).error?.status).toBe(400);
  });

  it('rejects a missing metricName', async () => {
    expect((await parseCreateGoalRequestBody(request({ ...validMaximizeGoal, metricName: undefined }))).error?.status).toBe(400);
  });

  it('rejects a missing direction', async () => {
    expect((await parseCreateGoalRequestBody(request({ ...validMaximizeGoal, direction: undefined }))).error?.status).toBe(400);
  });

  it('rejects a missing startDate or deadline', async () => {
    expect((await parseCreateGoalRequestBody(request({ ...validMaximizeGoal, startDate: undefined }))).error?.status).toBe(400);
    expect((await parseCreateGoalRequestBody(request({ ...validMaximizeGoal, deadline: undefined }))).error?.status).toBe(400);
  });

  it('rejects a missing rhythm', async () => {
    expect((await parseCreateGoalRequestBody(request({ ...validMaximizeGoal, rhythm: undefined }))).error?.status).toBe(400);
  });

  it('rejects a missing ownerPersonId', async () => {
    expect((await parseCreateGoalRequestBody(request({ ...validMaximizeGoal, ownerPersonId: undefined }))).error?.status).toBe(400);
  });

  it('rejects a non-numeric targetValue/rangeMin/rangeMax when sent', async () => {
    expect((await parseCreateGoalRequestBody(request({ ...validMaximizeGoal, targetValue: 'lots' }))).error?.status).toBe(400);
    expect((await parseCreateGoalRequestBody(request({ ...validMaximizeGoal, rangeMin: 'low' }))).error?.status).toBe(400);
    expect((await parseCreateGoalRequestBody(request({ ...validMaximizeGoal, rangeMax: 'high' }))).error?.status).toBe(400);
  });

  it('does not itself reject a direction/rhythm value outside the known enum — that is the service layer’s job', async () => {
    const parsed = await parseCreateGoalRequestBody(request({ ...validMaximizeGoal, direction: 'not_a_real_direction' }));
    expect(parsed.error).toBeUndefined();
  });
});
