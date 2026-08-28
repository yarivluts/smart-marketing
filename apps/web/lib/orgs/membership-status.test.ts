import { describe, expect, it } from 'vitest';
import { isActiveMembershipStatus } from './membership-status';

describe('isActiveMembershipStatus', () => {
  it('treats an explicit "active" status as active', () => {
    expect(isActiveMembershipStatus('active')).toBe(true);
  });

  it('treats a missing status (pre-KAN-25 record) as active', () => {
    expect(isActiveMembershipStatus(undefined)).toBe(true);
  });

  it('treats "invited" as not active', () => {
    expect(isActiveMembershipStatus('invited')).toBe(false);
  });

  it('treats "suspended" as not active', () => {
    expect(isActiveMembershipStatus('suspended')).toBe(false);
  });
});
