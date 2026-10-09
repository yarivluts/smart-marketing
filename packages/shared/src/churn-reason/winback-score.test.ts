import { describe, expect, it } from 'vitest';
import { calculateWinbackScore } from './winback-score';

describe('calculateWinbackScore', () => {
  it('assigns high score and pause_discount playbook to too_expensive exits', () => {
    const assessment = calculateWinbackScore('too_expensive');
    expect(assessment.score).toBeGreaterThanOrEqual(75);
    expect(assessment.potential).toBe('high');
    expect(assessment.recommendedPlaybook).toBe('pause_discount');
  });

  it('assigns adoption_concierge playbook to not_using_enough exits', () => {
    const assessment = calculateWinbackScore('not_using_enough');
    expect(assessment.score).toBe(65);
    expect(assessment.potential).toBe('medium');
    expect(assessment.recommendedPlaybook).toBe('adoption_concierge');
  });

  it('assigns feature_preview playbook to missing_features exits', () => {
    const assessment = calculateWinbackScore('missing_features');
    expect(assessment.recommendedPlaybook).toBe('feature_preview');
  });

  it('escalates to executive_outreach when MRR is high regardless of base reason', () => {
    const assessment = calculateWinbackScore('poor_support', { mrr: 2500 });
    expect(assessment.recommendedPlaybook).toBe('executive_outreach');
    expect(assessment.score).toBeGreaterThan(40);
  });

  it('boosts score when customer provided a thoughtful comment', () => {
    const withoutComment = calculateWinbackScore('switched_competitor', { hasComment: false });
    const withComment = calculateWinbackScore('switched_competitor', { hasComment: true });
    expect(withComment.score).toBe(withoutComment.score + 5);
  });

  it('handles unknown or other reasons gracefully with standard_followup', () => {
    const assessment = calculateWinbackScore('custom_unknown_reason');
    expect(assessment.recommendedPlaybook).toBe('standard_followup');
    expect(assessment.score).toBe(40);
  });
});
