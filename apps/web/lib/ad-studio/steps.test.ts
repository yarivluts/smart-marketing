import { describe, expect, it } from 'vitest';
import { planAdStudioSteps, resolveAdStudioStep, type AdStudioStepFacts } from './steps';

const NOTHING: AdStudioStepFacts = { hasMedia: false, hasContent: false, run: null, publishable: 0, published: 0 };

describe('planAdStudioSteps', () => {
  it('starts a new ad on Plan with everything after it locked', () => {
    const plan = planAdStudioSteps(NOTHING);
    expect(plan.states).toEqual({ brief: 'done', plan: 'current', create: 'locked', review: 'locked', publish: 'locked' });
    expect(plan.defaultStep).toBe('plan');
  });

  it('lets someone who wrote the script by hand go on to render in Review, without the autopilot', () => {
    const plan = planAdStudioSteps({ ...NOTHING, hasContent: true });
    expect(plan.states.plan).toBe('done');
    expect(plan.states.review).toBe('next');
    expect(plan.defaultStep).toBe('review');
  });

  it('waits on Plan while the autopilot plan awaits approval, then follows the rendering run in Create', () => {
    expect(planAdStudioSteps({ ...NOTHING, run: { status: 'awaiting_approval', planApproved: false } }).defaultStep).toBe('plan');
    const rendering = planAdStudioSteps({ ...NOTHING, hasContent: true, run: { status: 'running', planApproved: true } });
    expect(rendering.states.create).toBe('current');
    expect(rendering.defaultStep).toBe('create');
  });

  it('opens Review once media exists and Publish once something is ready, marking both done after publishing', () => {
    const plan = planAdStudioSteps({ ...NOTHING, hasMedia: true, hasContent: true, run: { status: 'done', planApproved: true }, publishable: 2, published: 1 });
    expect(plan.states).toEqual({ brief: 'done', plan: 'done', create: 'done', review: 'done', publish: 'done' });
    expect(plan.defaultStep).toBe('review');
  });
});

describe('resolveAdStudioStep', () => {
  it('opens the step asked for only when it is open, and falls back for a locked or unknown one', () => {
    const plan = planAdStudioSteps(NOTHING);
    expect(resolveAdStudioStep(plan, 'review')).toBe('plan');
    expect(resolveAdStudioStep(plan, 'nonsense')).toBe('plan');
    expect(resolveAdStudioStep(plan, 'brief')).toBe('brief');
    expect(resolveAdStudioStep(plan, undefined)).toBe('plan');
  });
});
