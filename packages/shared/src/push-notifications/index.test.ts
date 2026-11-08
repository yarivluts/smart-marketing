import { describe, expect, it } from 'vitest';
import {
  PUSH_CATEGORIES,
  defaultPushPreferences,
  isPushCategory,
  isSafePushUrl,
  normalizePushPreferences,
  pushAllowed,
  pushCategoryForEvent,
  pushEventKinds,
} from './index';

describe('push categories', () => {
  it('maps the events that need the person onto their category', () => {
    expect(pushCategoryForEvent('growth_pilot', 'targets_proposed')).toBe('approvals');
    expect(pushCategoryForEvent('growth_pilot', 'ads_ready')).toBe('ready');
    expect(pushCategoryForEvent('growth_pilot', 'video_ready')).toBe('ready');
    expect(pushCategoryForEvent('growth_pilot', 'ads_published')).toBe('publishing');
    expect(pushCategoryForEvent('growth_pilot', 'publish_failed')).toBe('failures');
    // Changes to live ads: the budget and the audience, and when either could not be made.
    expect(pushCategoryForEvent('growth_pilot', 'budget_changed')).toBe('publishing');
    expect(pushCategoryForEvent('growth_pilot', 'audience_applied')).toBe('publishing');
    expect(pushCategoryForEvent('growth_pilot', 'budget_change_failed')).toBe('failures');
    expect(pushCategoryForEvent('growth_pilot', 'audience_apply_failed')).toBe('failures');
    expect(pushCategoryForEvent('ad_studio', 'run_awaiting_approval')).toBe('approvals');
    expect(pushCategoryForEvent('ad_studio', 'run_done')).toBe('ready');
    expect(pushCategoryForEvent('ad_studio', 'run_failed')).toBe('failures');
  });

  it('sends nothing for feed-only events', () => {
    for (const kind of ['site_read', 'pilot_started', 'pilot_paused', 'proposal_approved', 'ads_building', 'unknown']) {
      expect(pushCategoryForEvent('growth_pilot', kind)).toBeNull();
    }
  });

  it('lists every pushing kind with a known category', () => {
    for (const kind of [...pushEventKinds('growth_pilot'), ...pushEventKinds('ad_studio')]) {
      const category = pushCategoryForEvent('growth_pilot', kind) ?? pushCategoryForEvent('ad_studio', kind);
      expect(isPushCategory(category)).toBe(true);
    }
  });
});

describe('push preferences', () => {
  it('starts with everything on', () => {
    const preferences = defaultPushPreferences();
    expect(preferences.enabled).toBe(true);
    expect(PUSH_CATEGORIES.every((category) => preferences.categories[category])).toBe(true);
  });

  it('fills gaps in a stored record and ignores junk', () => {
    expect(normalizePushPreferences({ enabled: false, categories: { ready: false, failures: 'no', other: true } })).toEqual({
      enabled: false,
      categories: { approvals: true, ready: false, publishing: true, failures: true },
    });
    expect(normalizePushPreferences(null)).toEqual(defaultPushPreferences());
  });

  it('allows a category only when the master switch and the category are on', () => {
    const preferences = defaultPushPreferences();
    expect(pushAllowed(preferences, 'ready')).toBe(true);
    expect(pushAllowed({ ...preferences, enabled: false }, 'ready')).toBe(false);
    expect(pushAllowed({ ...preferences, categories: { ...preferences.categories, ready: false } }, 'ready')).toBe(false);
  });
});

describe('isSafePushUrl', () => {
  it('accepts same-origin paths only', () => {
    expect(isSafePushUrl('/en/orgs/o/projects/p/growth-pilot')).toBe(true);
    expect(isSafePushUrl('https://evil.example')).toBe(false);
    expect(isSafePushUrl('//evil.example')).toBe(false);
    expect(isSafePushUrl('/\\evil.example')).toBe(false);
    expect(isSafePushUrl(null)).toBe(false);
  });
});
