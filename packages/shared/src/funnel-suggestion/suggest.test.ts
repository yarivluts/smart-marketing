import { describe, expect, it } from 'vitest';
import { proposeFunnelSteps } from './suggest';

describe('proposeFunnelSteps', () => {
  it('orders recognized events by funnel stage (awareness -> ... -> churn), ties broken alphabetically', () => {
    const proposal = proposeFunnelSteps([
      'subscription_cancelled',
      'order_placed',
      'checkout_started',
      'trial_started',
      'user_signed_up',
      'page_viewed',
    ]);

    expect(proposal.map((step) => step.eventSchemaName)).toEqual([
      'page_viewed',
      'user_signed_up',
      'trial_started',
      'checkout_started',
      'order_placed',
      'subscription_cancelled',
    ]);
    expect(proposal.map((step) => step.stageKey)).toEqual([
      'awareness',
      'signup',
      'trial',
      'checkout',
      'conversion',
      'churn',
    ]);
    // `order` is reassigned 0-based over the final sort, not the input order.
    expect(proposal.map((step) => step.order)).toEqual([0, 1, 2, 3, 4, 5]);
    for (const step of proposal) {
      expect(step.confidence).toBeGreaterThan(0);
    }
  });

  it('exact-token matches score higher than substring matches, but both count', () => {
    // "signup" is an exact token match; "accountcreation" contains no keyword as a whole token but
    // "accountcreated" isn't its exact normalized form either — only a real substring match should
    // land it in `signup`, not a false positive from a shorter unrelated keyword.
    const proposal = proposeFunnelSteps(['signup', 'account_created']);
    const byName = new Map(proposal.map((step) => [step.eventSchemaName, step]));
    expect(byName.get('signup')).toMatchObject({ stageKey: 'signup', confidence: 1 });
    expect(byName.get('account_created')).toMatchObject({ stageKey: 'signup' });
  });

  it('places an unrecognized event name in "other", sorted after every matched stage', () => {
    const proposal = proposeFunnelSteps(['widget_clicked', 'user_signed_up']);
    expect(proposal.map((step) => step.eventSchemaName)).toEqual(['user_signed_up', 'widget_clicked']);
    expect(proposal[1]).toMatchObject({ stageKey: 'other', confidence: 0 });
  });

  it('does not false-positive a short keyword as a bare substring (e.g. "reordered" is not "checkout")', () => {
    // "order" is a real keyword but short — only allowed to match as an exact token, never as a
    // substring of an unrelated word like "reordered".
    const proposal = proposeFunnelSteps(['catalog_reordered']);
    expect(proposal[0]).toMatchObject({ stageKey: 'other' });
  });

  it('returns an empty array for an empty input', () => {
    expect(proposeFunnelSteps([])).toEqual([]);
  });
});
