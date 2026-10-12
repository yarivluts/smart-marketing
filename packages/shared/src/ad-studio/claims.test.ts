import { describe, expect, it } from 'vitest';
import { findUnverifiedClaims } from './claims';

const SOURCES = ['E-signatures for lawyers. Sign a contract in 30 seconds. 14-day free trial.', 'Trial signups'];

describe('findUnverifiedClaims', () => {
  it('passes numbers and promises the sources state', () => {
    expect(findUnverifiedClaims('Sign in 30 seconds. Start your free trial.', SOURCES)).toEqual([]);
    expect(findUnverifiedClaims('14 days to try it', SOURCES)).toEqual([]);
  });

  it('flags numbers, prices and percentages nobody gave us, once each, in order', () => {
    expect(findUnverifiedClaims('Save 50% - only $9 a month, 50% off', SOURCES)).toEqual(['50%', 'only', '$9']);
    expect(findUnverifiedClaims('Trusted by 10,000 firms', SOURCES)).toEqual(['10,000']);
  });

  it('flags promise words the sources do not make, whole words only', () => {
    expect(findUnverifiedClaims('The best e-signature, guaranteed', SOURCES)).toEqual(['best', 'guaranteed']);
    // "Bestseller" or "freedom" are not the promise words.
    expect(findUnverifiedClaims('Freedom from paper', SOURCES)).toEqual([]);
  });

  it('checks Hebrew promise words too', () => {
    expect(findUnverifiedClaims('\u05d4\u05db\u05d9 \u05de\u05d4\u05d9\u05e8 \u05e9\u05d9\u05e9', ['Fast e-signatures'])).toEqual(['\u05d4\u05db\u05d9']);
    expect(findUnverifiedClaims('\u05e0\u05e1\u05d5 \u05d7\u05d9\u05e0\u05dd', ['\u05e0\u05d9\u05e1\u05d9\u05d5\u05df \u05d7\u05d9\u05e0\u05dd \u05dc-14 \u05d9\u05de\u05d9\u05dd'])).toEqual([]);
  });
});
