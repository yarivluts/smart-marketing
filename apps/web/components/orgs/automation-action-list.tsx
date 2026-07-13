'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { actionStatusLabelKey, diffFieldLabelKey, violationLabelKey, type AutomationActionView } from '@/lib/orgs/automation-view';

export interface AutomationActionListProps {
  orgId: string;
  projectId: string;
  actions: AutomationActionView[];
  canApprove: boolean;
}

function VerifyControls({ orgId, projectId, actionId }: { orgId: string; projectId: string; actionId: string }): React.ReactElement {
  const t = useTranslations('Automation');
  const router = useRouter();
  const [guardedMetricBefore, setGuardedMetricBefore] = useState('');
  const [guardedMetricAfter, setGuardedMetricAfter] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleVerify(): Promise<void> {
    setSubmitting(true);
    try {
      const before = guardedMetricBefore.trim().length > 0 ? Number(guardedMetricBefore) : undefined;
      const after = guardedMetricAfter.trim().length > 0 ? Number(guardedMetricAfter) : undefined;
      await fetch(`/api/orgs/${orgId}/projects/${projectId}/automation/actions/${actionId}/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ guardedMetricBefore: before, guardedMetricAfter: after }),
      });
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-wrap items-end gap-2">
      <div className="flex flex-col gap-1">
        <label className="text-xs text-muted-foreground" htmlFor={`verify-metric-before-${actionId}`}>
          {t('verifyGuardedMetricBeforeLabel')}
        </label>
        <Input
          id={`verify-metric-before-${actionId}`}
          type="number"
          className="h-8 w-24"
          value={guardedMetricBefore}
          onChange={(event) => setGuardedMetricBefore(event.target.value)}
        />
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-xs text-muted-foreground" htmlFor={`verify-metric-after-${actionId}`}>
          {t('verifyGuardedMetricAfterLabel')}
        </label>
        <Input
          id={`verify-metric-after-${actionId}`}
          type="number"
          className="h-8 w-24"
          value={guardedMetricAfter}
          onChange={(event) => setGuardedMetricAfter(event.target.value)}
        />
      </div>
      <Button type="button" size="sm" variant="outline" disabled={submitting} onClick={handleVerify}>
        {t('verifyButton')}
      </Button>
    </div>
  );
}

/** A project's KAN-71 automation action queue/history — the approve/execute/verify/rollback controls for each action's current status. */
export function AutomationActionList({ orgId, projectId, actions, canApprove }: AutomationActionListProps): React.ReactElement {
  const t = useTranslations('Automation');
  const router = useRouter();
  const [pendingActionId, setPendingActionId] = useState<string | null>(null);

  async function runTransition(actionId: string, transition: 'approve' | 'reject' | 'execute' | 'rollback'): Promise<void> {
    setPendingActionId(actionId);
    try {
      await fetch(`/api/orgs/${orgId}/projects/${projectId}/automation/actions/${actionId}/${transition}`, { method: 'POST' });
      router.refresh();
    } finally {
      setPendingActionId(null);
    }
  }

  if (actions.length === 0) {
    return <p className="text-sm text-muted-foreground">{t('actionsEmptyNote')}</p>;
  }

  return (
    <ul className="flex flex-col gap-3">
      {actions.map((action) => (
        <li key={action.id} className="flex flex-col gap-2 rounded-md border border-input px-3 py-3 text-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="font-medium">{action.targetLabel}</span>
            <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium">{t(actionStatusLabelKey(action.status))}</span>
          </div>
          <ul className="flex flex-col gap-0.5 text-muted-foreground">
            {action.diffEntries.map((entry) => {
              const labelKey = diffFieldLabelKey(entry.key);
              return (
                <li key={entry.key}>
                  {t('diffRowLine', {
                    label: labelKey ? t(labelKey) : entry.key,
                    before: String(entry.before),
                    after: String(entry.after),
                  })}
                </li>
              );
            })}
          </ul>
          {action.guardrailViolations.length > 0 ? (
            <ul className="list-inside list-disc text-destructive">
              {action.guardrailViolations.map((violation, index) => (
                <li key={index}>{t(violationLabelKey(violation.type))}</li>
              ))}
            </ul>
          ) : null}
          {action.failureReason ? <p className="text-destructive">{t('failureReasonLine', { reason: action.failureReason })}</p> : null}
          {action.rollbackReason ? <p className="text-muted-foreground">{t('rollbackReasonLine', { reason: action.rollbackReason })}</p> : null}

          <div className="flex flex-wrap items-center gap-2">
            {action.status === 'awaiting_approval' && canApprove ? (
              <>
                <Button type="button" size="sm" disabled={pendingActionId === action.id} onClick={() => runTransition(action.id, 'approve')}>
                  {t('approveButton')}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={pendingActionId === action.id}
                  onClick={() => runTransition(action.id, 'reject')}
                >
                  {t('rejectButton')}
                </Button>
              </>
            ) : null}
            {action.status === 'blocked' && canApprove ? (
              <Button type="button" size="sm" variant="outline" disabled={pendingActionId === action.id} onClick={() => runTransition(action.id, 'reject')}>
                {t('rejectButton')}
              </Button>
            ) : null}
            {action.status === 'approved' ? (
              <Button type="button" size="sm" disabled={pendingActionId === action.id} onClick={() => runTransition(action.id, 'execute')}>
                {t('executeButton')}
              </Button>
            ) : null}
            {action.status === 'executed' ? (
              <>
                <VerifyControls orgId={orgId} projectId={projectId} actionId={action.id} />
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={pendingActionId === action.id}
                  onClick={() => runTransition(action.id, 'rollback')}
                >
                  {t('rollbackButton')}
                </Button>
              </>
            ) : null}
            {action.status === 'verified' ? (
              <Button type="button" size="sm" variant="outline" disabled={pendingActionId === action.id} onClick={() => runTransition(action.id, 'rollback')}>
                {t('rollbackButton')}
              </Button>
            ) : null}
          </div>
        </li>
      ))}
    </ul>
  );
}
