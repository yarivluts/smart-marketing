import { describe, expect, it } from 'vitest';
import { planAdStudioSteps, resolveAdStudioStep, type AdStudioStepFacts } from './steps';

const NOTHING: AdStudioStepFacts = { hasMedia: false, hasContent: false, run: null, publishable: 0, published: 0 };

describe('planAdStudioSteps', () => {
  it('starts a new ad on Plan with everything after it locked', () => {
    const plan = planAdStudioSteps(NOTHING);
    expect(plan.states).toEqual({ brief: 'done', plan: 'current', review: 'locked', publish: 'locked' });
    expect(plan.defaultStep).toBe('plan');
  });

  it('lets someone who wrote the script by hand go on to Create & review, without the autopilot', () => {
    const plan = planAdStudioSteps({ ...NOTHING, hasContent: true });
    expect(plan.states.plan).toBe('done');
    expect(plan.states.review).toBe('next');
    expect(plan.defaultStep).toBe('review');
  });

  it('waits on Plan while the autopilot plan awaits approval, then follows the rendering run in Create & review', () => {
    expect(planAdStudioSteps({ ...NOTHING, run: { status: 'awaiting_approval', planApproved: false } }).defaultStep).toBe('plan');
    const rendering = planAdStudioSteps({ ...NOTHING, hasContent: true, run: { status: 'running', planApproved: true } });
    expect(rendering.states.review).toBe('current');
    expect(rendering.defaultStep).toBe('review');
  });

  it('marks Create & review and Publish done once media exists and an ad is published', () => {
    const plan = planAdStudioSteps({ ...NOTHING, hasMedia: true, hasContent: true, run: { status: 'done', planApproved: true }, publishable: 2, published: 1 });
    expect(plan.states).toEqual({ brief: 'done', plan: 'done', review: 'done', publish: 'done' });
    expect(plan.defaultStep).toBe('review');
  });
});

describe('resolveAdStudioStep', () => {
  it('opens the step asked for only when it is open, maps legacy create to review, and falls back when locked or unknown', () => {
    const locked = planAdStudioSteps(NOTHING);
    expect(resolveAdStudioStep(locked, 'review')).toBe('plan');
    expect(resolveAdStudioStep(locked, 'create')).toBe('plan');
    expect(resolveAdStudioStep(locked, 'nonsense')).toBe('plan');
    expect(resolveAdStudioStep(locked, 'brief')).toBe('brief');
    expect(resolveAdStudioStep(locked, undefined)).toBe('plan');

    const unlocked = planAdStudioSteps({ ...NOTHING, hasContent: true });
    expect(resolveAdStudioStep(unlocked, 'create')).toBe('review');
    expect(resolveAdStudioStep(unlocked, 'review')).toBe('review');
  });
});
