'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import type { ConnectionWriteTier } from '@growthos/firebase-orm-models';
import { useRouter } from '@/i18n/navigation';

export interface WriteTierSelectorProps {
  orgId: string;
  attachmentId: string;
  tier: ConnectionWriteTier;
  /** Read-only when the caller lacks `resources.manage` — same gate as `DetachAttachmentButton`. */
  disabled?: boolean;
}

const WRITE_TIER_LABEL_KEYS: Record<ConnectionWriteTier, string> = {
  read: 'writeTierRead',
  optimize: 'writeTierOptimize',
  manage: 'writeTierManage',
};

/** A credential connection's KAN-74 write-tier selector (Read/Optimize/Manage) — a downgrade takes effect immediately for any in-flight automation action against that connection. */
export function WriteTierSelector({ orgId, attachmentId, tier, disabled }: WriteTierSelectorProps): React.ReactElement {
  const t = useTranslations('ProjectResources');
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(false);

  async function handleChange(event: React.ChangeEvent<HTMLSelectElement>): Promise<void> {
    const nextTier = event.target.value;
    setError(false);
    setSubmitting(true);
    try {
      const response = await fetch(`/api/orgs/${orgId}/resource-attachments/${attachmentId}/write-tier`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tier: nextTier }),
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

  return (
    <div className="flex flex-col items-end gap-1">
      <label className="sr-only" htmlFor={`write-tier-${attachmentId}`}>
        {t('writeTierLabel')}
      </label>
      <select
        id={`write-tier-${attachmentId}`}
        value={tier}
        onChange={handleChange}
        disabled={disabled || submitting}
        className="h-8 rounded-md border border-input bg-background px-2 text-xs"
      >
        {(Object.keys(WRITE_TIER_LABEL_KEYS) as ConnectionWriteTier[]).map((option) => (
          <option key={option} value={option}>
            {t(WRITE_TIER_LABEL_KEYS[option])}
          </option>
        ))}
      </select>
      {error ? (
        <p role="alert" className="text-xs text-destructive">
          {t('writeTierError')}
        </p>
      ) : null}
    </div>
  );
}
