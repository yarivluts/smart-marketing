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
});
