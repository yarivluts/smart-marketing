import { describe, expect, it } from 'vitest';
import { processCopilotQuery } from './copilot-engine';

describe('CopilotEngine NLP & Action Proposals', () => {
  it('detects Hebrew top ads query and returns formatted analytics response', () => {
    const result = processCopilotQuery('אילו מודעות הכי רווחיות השבוע?', { locale: 'he' });
    expect(result.message.content).toContain('המודעות הכי רווחיות השבוע הן במודעות Meta עם ROAS של 4.2x.');
    expect(result.actionProposal).toBeUndefined();
  });

  it('detects English top ads query and returns formatted analytics response', () => {
    const result = processCopilotQuery('What are the top ads this week?', { locale: 'en' });
    expect(result.message.content).toContain('Your top-performing ads this week are Meta Retargeting campaigns with 4.2x ROAS.');
  });

  it('detects Hebrew budget increase intent with dynamic amount', () => {
    const result = processCopilotQuery('הגדל תקציב ל-350$ ב-Meta', { locale: 'he' });
    expect(result.actionProposal).toBeDefined();
    expect(result.actionProposal?.actionType).toBe('budget_change');
    expect(result.actionProposal?.targetLabel).toBe('Meta Retargeting Leads');
    expect(result.actionProposal?.afterValue).toBe('$350/day');
    expect(result.actionProposal?.payload.dailyBudgetUsd).toBe(350);
  });

  it('detects English budget increase intent and generates proposal card', () => {
    const result = processCopilotQuery('Increase budget for retargeting campaign to $250', { locale: 'en' });
    expect(result.actionProposal).toBeDefined();
    expect(result.actionProposal?.beforeValue).toBe('$150/day');
    expect(result.actionProposal?.afterValue).toBe('$250/day');
    expect(result.actionProposal?.estimatedImpact).toBe('+32% projected conversions');
  });

  it('detects new campaign creation intent in English and Hebrew', () => {
    const enResult = processCopilotQuery('Create a new campaign for lawyers', { locale: 'en' });
    expect(enResult.actionProposal?.actionType).toBe('campaign_draft_create');
    expect(enResult.actionProposal?.targetLabel).toBe('Google Search - Legal Leads');

    const heResult = processCopilotQuery('צור קמפיין חיפוש חדש', { locale: 'he' });
    expect(heResult.actionProposal?.actionType).toBe('campaign_draft_create');
    expect(heResult.message.content).toContain('טיוטת קמפיין חדש מוכנה לאישור.');
  });

  it('detects multi-channel budget rebalancing intent', () => {
    const result = processCopilotQuery('Reallocate Google to Meta budget', { locale: 'en' });
    expect(result.actionProposal?.targetLabel).toContain('Shift $500/day from Google to Meta Ads');
    expect(result.actionProposal?.estimatedImpact).toContain('Blended ROAS');
  });

  it('detects funnel drop-off optimization intent', () => {
    const result = processCopilotQuery('Optimize drop-off at stage 2', { locale: 'en' });
    expect(result.actionProposal?.targetLabel).toContain('EasySign - Viewed Drop-off Retargeting');
    expect(result.actionProposal?.afterValue).toContain('$150/day');
  });

  it('detects ad pause intent for low performing campaign', () => {
    const result = processCopilotQuery('Pause underperforming campaign with high CAC', { locale: 'en' });
    expect(result.actionProposal?.actionType).toBe('campaign_activation');
    expect(result.actionProposal?.afterValue).toBe('PAUSED');
  });

  it('returns polite fallback message when intent is unrecognized', () => {
    const result = processCopilotQuery('hello growthos', { locale: 'en' });
    expect(result.message.content).toBe('How can I help you optimize your growth campaigns today?');
    expect(result.actionProposal).toBeUndefined();
  });
});
