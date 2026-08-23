'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import type { ActionPluginInstallOptionView, CrmSyncRunView } from '@/lib/orgs/crm-sync-view';

export interface SegmentCrmSyncControlsProps {
  orgId: string;
  projectId: string;
  segmentId: string;
  actionInstalls: readonly ActionPluginInstallOptionView[];
  latestRun: CrmSyncRunView | null;
}

/** "Sync to CRM" (KAN-81, plan `14 §Gap 5`: "export/sync to CRM ... action plugin") — picks one of the project's installed action-type plugins and pushes this segment's own currently-matching rows to it "right now". Mirrors `TriggerSourcePluginRunButton`'s exact shape for the outbound direction. */
export function SegmentCrmSyncControls({ orgId, projectId, segmentId, actionInstalls, latestRun }: SegmentCrmSyncControlsProps): React.ReactElement {
  const t = useTranslations('Segments');
  const router = useRouter();
  const [installId, setInstallId] = useState(actionInstalls[0]?.id ?? '');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(false);

  async function handleClick(): Promise<void> {
    setError(false);
    setSubmitting(true);
    try {
      const response = await fetch(`/api/orgs/${orgId}/projects/${projectId}/segments/${segmentId}/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ installId }),
      });
      if (!response.ok) {
        setError(true);
        return;
      }
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  }

  if (actionInstalls.length === 0) {
    return <p className="text-xs text-muted-foreground">{t('crmSyncNoInstalls')}</p>;
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <div className="flex items-center gap-2">
        <select
          value={installId}
          onChange={(event) => setInstallId(event.target.value)}
          className="h-9 rounded-md border border-input bg-background px-2 text-sm"
          aria-label={t('crmSyncInstallLabel')}
        >
          {actionInstalls.map((install) => (
            <option key={install.id} value={install.id}>
              {install.pluginId}
            </option>
          ))}
        </select>
        <Button type="button" variant="outline" size="sm" onClick={handleClick} disabled={submitting}>
          {t('crmSyncButton')}
        </Button>
      </div>
      {error ? (
        <p role="alert" className="text-xs text-destructive">
          {t('crmSyncError')}
        </p>
      ) : latestRun ? (
        <p className="text-xs text-muted-foreground">
          {latestRun.status === 'succeeded'
            ? t('crmSyncLastRunSucceeded', { count: latestRun.recordsPushed ?? 0 })
            : latestRun.status === 'failed'
              ? t('crmSyncLastRunFailed')
              : t('crmSyncLastRunRunning')}
        </p>
      ) : null}
    </div>
  );
}
