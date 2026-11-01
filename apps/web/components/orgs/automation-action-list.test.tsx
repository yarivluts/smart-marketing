import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithIntl } from '@/tests/e2e/helpers/test-harness';
import enMessages from '@/messages/en.json';
import heMessages from '@/messages/he.json';
import { AutomationActionList } from './automation-action-list';
import type { AutomationActionView } from '@/lib/orgs/automation-view';

vi.mock('@/i18n/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));

const failed: AutomationActionView = {
  id: 'a1',
  targetId: 't1',
  targetLabel: 'Spring sale',
  status: 'failed',
  diffEntries: [],
  guardrailViolations: [],
  proposedAt: '2026-10-16T08:00:00Z',
  failureReason: 'Budget too low',
};

describe('AutomationActionList failure', () => {
  it('says the change was not applied and what to do next, in English', () => {
    renderWithIntl(<AutomationActionList orgId="o" projectId="p" actions={[failed]} canApprove />);
    const box = screen.getByTestId('automation-failure-a1');
    expect(box).toHaveTextContent('This change was not applied. What the ad platform said: Budget too low');
    expect(box).toHaveTextContent('propose the change again');
    expect(box).not.toHaveTextContent('Execution failed');
  });

  it('is translated in Hebrew', () => {
    renderWithIntl(<AutomationActionList orgId="o" projectId="p" actions={[failed]} canApprove />, { locale: 'he' });
    expect(screen.getByTestId('automation-failure-a1')).toHaveTextContent(heMessages.Automation.failureNextStep);
  });

  it('shows nothing extra when nothing failed', () => {
    renderWithIntl(<AutomationActionList orgId="o" projectId="p" actions={[{ ...failed, status: 'executed', failureReason: undefined }]} canApprove />);
    expect(screen.queryByTestId('automation-failure-a1')).toBeNull();
    expect(enMessages.Automation.failureNextStep).toBeTruthy();
  });

  it('hides execute, verify, and rollback controls when canExecute is false (KAN-151)', () => {
    const actions: AutomationActionView[] = [
      { ...failed, id: 'a-approved', status: 'approved', failureReason: undefined },
      { ...failed, id: 'a-executed', status: 'executed', failureReason: undefined },
      { ...failed, id: 'a-verified', status: 'verified', failureReason: undefined },
    ];
    renderWithIntl(<AutomationActionList orgId="o" projectId="p" actions={actions} canApprove={false} canExecute={false} />);
    expect(screen.queryByRole('button', { name: enMessages.Automation.executeButton })).toBeNull();
    expect(screen.queryByRole('button', { name: enMessages.Automation.verifyButton })).toBeNull();
    expect(screen.queryByRole('button', { name: enMessages.Automation.rollbackButton })).toBeNull();
  });
});

describe('AutomationActionList rollback reason', () => {
  const undone = (reason: string): AutomationActionView => ({ ...failed, status: 'rolled_back', failureReason: undefined, rollbackReason: reason });

  it('says in plain words who or what undid the change, never the raw code', () => {
    const { unmount } = renderWithIntl(<AutomationActionList orgId="o" projectId="p" actions={[undone('manual')]} canApprove />);
    expect(screen.getByTestId('automation-rollback-a1')).toHaveTextContent(enMessages.Automation.rollbackManual);
    expect(screen.getByTestId('automation-rollback-a1')).not.toHaveTextContent('manual)');
    unmount();
    renderWithIntl(<AutomationActionList orgId="o" projectId="p" actions={[undone('guardrail_regression')]} canApprove />);
    expect(screen.getByTestId('automation-rollback-a1')).toHaveTextContent('because your results got worse');
    expect(screen.getByTestId('automation-rollback-a1')).not.toHaveTextContent('guardrail_regression');
  });

  it('is translated in Hebrew and falls back to a plain line for unknown reasons', () => {
    renderWithIntl(<AutomationActionList orgId="o" projectId="p" actions={[undone('something_new')]} canApprove />, { locale: 'he' });
    expect(screen.getByTestId('automation-rollback-a1')).toHaveTextContent(heMessages.Automation.rollbackOther);
  });
});
