import { describe, expect, it } from 'vitest';
import {
  cancellationReasonCodeLabelKey,
  cancellationReasonThemeLabelKey,
  cancellationReasonPillAccent,
  winbackPotentialAccent,
  winbackPlaybookLabelKey,
  toCancellationReasonDimensionBreakdownRows,
} from './churn-reason-view';

describe('churn-reason-view', () => {
  it('maps reason codes to label keys correctly', () => {
    expect(cancellationReasonCodeLabelKey('too_expensive')).toBe('reasonTooExpensive');
    expect(cancellationReasonCodeLabelKey('missing_features')).toBe('reasonMissingFeatures');
    expect(cancellationReasonCodeLabelKey('switched_competitor')).toBe('reasonSwitchedCompetitor');
    expect(cancellationReasonCodeLabelKey('poor_support')).toBe('reasonPoorSupport');
    expect(cancellationReasonCodeLabelKey('not_using_enough')).toBe('reasonNotUsingEnough');
    expect(cancellationReasonCodeLabelKey('technical_issues')).toBe('reasonTechnicalIssues');
    expect(cancellationReasonCodeLabelKey('other')).toBe('reasonOther');
    expect(cancellationReasonCodeLabelKey('unknown_custom')).toBe('unknown_custom');
  });

  it('maps theme clusters to label keys correctly', () => {
    expect(cancellationReasonThemeLabelKey('pricing')).toBe('themePricing');
    expect(cancellationReasonThemeLabelKey('competitor')).toBe('themeCompetitor');
    expect(cancellationReasonThemeLabelKey('missing_features')).toBe('themeMissingFeatures');
    expect(cancellationReasonThemeLabelKey('support')).toBe('themeSupport');
    expect(cancellationReasonThemeLabelKey('bugs')).toBe('themeBugs');
    expect(cancellationReasonThemeLabelKey('not_using')).toBe('themeNotUsing');
    expect(cancellationReasonThemeLabelKey('custom_theme')).toBe('custom_theme');
  });

  it('returns distinct Pastel Pulse accents for reason codes and potentials', () => {
    expect(cancellationReasonPillAccent('too_expensive')).toBe('pink');
    expect(cancellationReasonPillAccent('switched_competitor')).toBe('primary');
    expect(cancellationReasonPillAccent('missing_features')).toBe('sky');
    expect(cancellationReasonPillAccent('not_using_enough')).toBe('mint');
    expect(cancellationReasonPillAccent('technical_issues')).toBe('neutral');

    expect(winbackPotentialAccent('high')).toBe('mint');
    expect(winbackPotentialAccent('medium')).toBe('sky');
    expect(winbackPotentialAccent('low')).toBe('neutral');
  });

  it('maps playbook identifiers to translation keys', () => {
    expect(winbackPlaybookLabelKey('pause_discount')).toBe('playbookPauseDiscount');
    expect(winbackPlaybookLabelKey('smart_dunning')).toBe('playbookSmartDunning');
    expect(winbackPlaybookLabelKey('executive_outreach')).toBe('playbookExecutiveOutreach');
    expect(winbackPlaybookLabelKey('adoption_concierge')).toBe('playbookAdoptionConcierge');
  });

  it('aggregates dimension rows correctly', () => {
    const rows = [
      { plan_interval: 'month', cancellations_total: 5 },
      { plan_interval: 'month', cancellations_total: 3 },
      { plan_interval: 'year', cancellations_total: 2 },
    ];
    const result = toCancellationReasonDimensionBreakdownRows(rows, 'plan_interval');
    expect(result).toEqual([
      { value: 'month', count: 8 },
      { value: 'year', count: 2 },
    ]);
  });
});
