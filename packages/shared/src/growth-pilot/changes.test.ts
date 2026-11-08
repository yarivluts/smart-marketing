import { describe, expect, it } from 'vitest';
import { canChangeGrowthTarget, growthChangeAreas, isGrowthChangeArea, isLiveGrowthPublishStatus, tidyGrowthChangeRequest, type GrowthChangeFacts } from './changes';

const LIVE: GrowthChangeFacts = { status: 'active', briefId: 'b1', adsStatus: 'approved', landingStatus: 'published', audienceStatus: 'approved', publishStatus: 'none' };

describe('growthChangeAreas', () => {
  it('offers every part once each exists and nothing is live yet', () => {
    expect(growthChangeAreas(LIVE)).toEqual(['ads', 'landing', 'audience']);
  });

  it('offers nothing for a target that is not approved', () => {
    expect(growthChangeAreas({ ...LIVE, status: 'proposed' })).toEqual([]);
    expect(growthChangeAreas({ ...LIVE, status: 'paused' })).toEqual([]);
  });

  it('does not offer ads while they are being made or before a brief exists', () => {
    expect(canChangeGrowthTarget({ ...LIVE, adsStatus: 'building' }, 'ads')).toBe(false);
    expect(canChangeGrowthTarget({ ...LIVE, adsStatus: 'none' }, 'ads')).toBe(false);
    expect(canChangeGrowthTarget({ ...LIVE, briefId: null }, 'ads')).toBe(false);
    expect(canChangeGrowthTarget({ ...LIVE, adsStatus: 'failed' }, 'ads')).toBe(true);
    expect(canChangeGrowthTarget({ ...LIVE, adsStatus: 'rejected' }, 'ads')).toBe(true);
  });

  it('offers the landing page once one was written, declined or failed, but not before', () => {
    expect(canChangeGrowthTarget({ ...LIVE, landingStatus: 'none' }, 'landing')).toBe(false);
    for (const status of ['ready', 'published', 'rejected', 'failed']) expect(canChangeGrowthTarget({ ...LIVE, landingStatus: status }, 'landing')).toBe(true);
  });

  it('offers the audience also once the ads are published or running (the change then updates the live ad set)', () => {
    expect(canChangeGrowthTarget({ ...LIVE, publishStatus: 'published' }, 'audience')).toBe(true);
    expect(canChangeGrowthTarget({ ...LIVE, publishStatus: 'running' }, 'audience')).toBe(true);
    expect(canChangeGrowthTarget({ ...LIVE, publishStatus: 'running', audienceStatus: 'rejected' }, 'audience')).toBe(true);
    expect(canChangeGrowthTarget({ ...LIVE, publishStatus: 'rejected' }, 'audience')).toBe(true);
    expect(canChangeGrowthTarget({ ...LIVE, audienceStatus: 'none' }, 'audience')).toBe(false);
    expect(canChangeGrowthTarget({ ...LIVE, publishStatus: 'running', pendingAreas: ['audience'] }, 'audience')).toBe(false);
  });

  it('knows which publish states are live on the platform', () => {
    expect(isLiveGrowthPublishStatus('published')).toBe(true);
    expect(isLiveGrowthPublishStatus('running')).toBe(true);
    for (const status of ['none', 'ready', 'needs_meta', 'failed', 'rejected', null, undefined]) expect(isLiveGrowthPublishStatus(status)).toBe(false);
  });

  it('does not offer a part already being changed', () => {
    expect(growthChangeAreas({ ...LIVE, pendingAreas: ['ads'] })).toEqual(['landing', 'audience']);
  });
});

describe('helpers', () => {
  it('knows the areas and tidies a request', () => {
    expect(isGrowthChangeArea('ads')).toBe(true);
    expect(isGrowthChangeArea('video')).toBe(false);
    expect(tidyGrowthChangeRequest('  shorter\n\n headline ')).toBe('shorter headline');
    expect(tidyGrowthChangeRequest('x'.repeat(2000))).toHaveLength(1000);
  });
});
