'use client';

import { useState, type FormEvent } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { AutomationKillSwitchStatus } from '@/lib/orgs/automation-view';

export interface AutomationKillSwitchPanelProps {
  orgId: string;
  status: AutomationKillSwitchStatus;
}

/** The org's KAN-71 "pause all automation" kill switch — engage (with a required reason) or disengage. */
export function AutomationKillSwitchPanel({ orgId, status }: AutomationKillSwitchPanelProps): React.ReactElement {
  const t = useTranslations('Automation');
  const router = useRouter();
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggle(engaged: boolean, event?: FormEvent<HTMLFormElement>): Promise<void> {
    event?.preventDefault();
    setError(null);
    if (engaged && reason.trim().length === 0) {
      setError(t('killSwitchReasonRequiredError'));
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch(`/api/orgs/${orgId}/automation/kill-switch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ engaged, reason: engaged ? reason.trim() : undefined }),
      });
      if (!response.ok) {
        setError(t('killSwitchError'));
        return;
      }
      setReason('');
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  }

  if (status.engaged) {
    return (
      <div className="flex flex-col gap-3 rounded-md border border-destructive/50 bg-destructive/10 p-4">
        <p className="text-sm font-medium text-destructive">{t('killSwitchEngagedNote', { reason: status.reason ?? '' })}</p>
        <Button type="button" variant="outline" disabled={submitting} onClick={() => toggle(false)}>
          {t('killSwitchDisengageButton')}
        </Button>
        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <form className="flex flex-col gap-3" onSubmit={(event) => toggle(true, event)}>
      <p className="text-sm text-muted-foreground">{t('killSwitchDisengagedNote')}</p>
      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium" htmlFor="kill-switch-reason">
          {t('killSwitchReasonLabel')}
        </label>
        <Input id="kill-switch-reason" value={reason} onChange={(event) => setReason(event.target.value)} />
      </div>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <Button type="submit" variant="destructive" disabled={submitting}>
        {t('killSwitchEngageButton')}
      </Button>
    </form>
  );
}
