'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { Trash2 } from 'lucide-react';
import { PpButton } from '@/components/pastel/primitives';

export interface DismissQuarantinedRecordButtonProps {
  orgId: string;
  projectId: string;
  quarantinedRecordId: string;
}

/**
 * Permanently discards one quarantined record without replaying it (KAN-131) from the ingest-health
 * quarantine browser — for a record that will never validate (an abandoned integration's payload, a
 * one-off malformed test event) and isn't worth a schema change. Confirms before submitting, same
 * "irreversible destructive action" posture as `DeleteGoalButton`/`DeleteSegmentButton`, since a
 * dismissed record has no `undismiss`.
 */
export function DismissQuarantinedRecordButton({
  orgId,
  projectId,
  quarantinedRecordId,
}: DismissQuarantinedRecordButtonProps): React.ReactElement {
  const t = useTranslations('IngestHealth');
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(false);

  async function handleClick(): Promise<void> {
    if (!window.confirm(t('dismissConfirm'))) {
      return;
    }
    setError(false);
    setSubmitting(true);
    try {
      const response = await fetch(
        `/api/orgs/${orgId}/projects/${projectId}/quarantined-records/${quarantinedRecordId}/dismiss`,
        { method: 'POST' },
      );
      if (!response.ok) {
        setError(true);
        return;
      }
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <PpButton
        type="button"
        variant="danger"
        size="sm"
        onClick={handleClick}
        disabled={submitting}
        icon={Trash2}
      >
        {t('dismissButtonLabel')}
      </PpButton>
      {error ? (
        <p role="alert" className="text-xs text-pp-error font-medium">
          {t('dismissError')}
        </p>
      ) : null}
    </div>
  );
}
