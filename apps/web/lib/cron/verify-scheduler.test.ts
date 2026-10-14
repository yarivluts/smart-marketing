// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { schedulerIdentityFromEnv, verifySchedulerRequest, type SchedulerIdentity } from './verify-scheduler';

const IDENTITY: SchedulerIdentity = { serviceAccount: 'growth-pilot-scheduler@growthos-g2w84.iam.gserviceaccount.com', audience: 'https://app.growthos.io/api/cron/growth-pilot' };
const NOW = new Date('2026-10-14T10:00:00Z');
const CLAIMS = { iss: 'https://accounts.google.com', aud: IDENTITY.audience, email: IDENTITY.serviceAccount, email_verified: 'true', exp: String(NOW.getTime() / 1000 + 600) };
const google = (claims: object | null, status = 200) => vi.fn(async (_url: string) => (claims ? new Response(JSON.stringify(claims), { status }) : new Response('bad', { status: 400 })));

describe('verifySchedulerRequest', () => {
  it('accepts only a Google-vouched token for the scheduler account, this audience, not expired', async () => {
    const fetchImpl = google(CLAIMS);
    expect(await verifySchedulerRequest('Bearer abc.def.ghi', IDENTITY, fetchImpl as never, NOW)).toBe(true);
    expect(String(fetchImpl.mock.calls[0][0])).toBe('https://oauth2.googleapis.com/tokeninfo?id_token=abc.def.ghi');
  });

  it('refuses everything else', async () => {
    const refuse = async (claims: object | null, header = 'Bearer t', identity = IDENTITY) => verifySchedulerRequest(header, identity, google(claims) as never, NOW);
    expect(await refuse(CLAIMS, '')).toBe(false);
    expect(await refuse(CLAIMS, 'Basic abc')).toBe(false);
    expect(await refuse(null)).toBe(false);
    expect(await refuse({ ...CLAIMS, email: 'someone@else.iam.gserviceaccount.com' })).toBe(false);
    expect(await refuse({ ...CLAIMS, aud: 'https://evil.example/api/cron/growth-pilot' })).toBe(false);
    expect(await refuse({ ...CLAIMS, iss: 'https://evil.example' })).toBe(false);
    expect(await refuse({ ...CLAIMS, email_verified: 'false' })).toBe(false);
    expect(await refuse({ ...CLAIMS, exp: String(NOW.getTime() / 1000 - 1) })).toBe(false);
    expect(await refuse(CLAIMS, 'Bearer t', { serviceAccount: null, audience: IDENTITY.audience })).toBe(false);
    expect(await verifySchedulerRequest('Bearer t', IDENTITY, vi.fn(async () => { throw new Error('down'); }) as never, NOW)).toBe(false);
  });

  it('reads the scheduler identity from the environment', () => {
    expect(schedulerIdentityFromEnv({ GROWTHOS_SCHEDULER_SA: ' sa@x ', GROWTHOS_SCHEDULER_AUDIENCE: 'https://a/b' } as never)).toEqual({ serviceAccount: 'sa@x', audience: 'https://a/b' });
    expect(schedulerIdentityFromEnv({} as never)).toEqual({ serviceAccount: null, audience: null });
  });
});
