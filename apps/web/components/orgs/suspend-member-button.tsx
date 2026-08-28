'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';

export interface SuspendMemberButtonProps {
  orgId: string;
  membershipId: string;
}

/**
 * Pauses an active member's access without removing their membership (KAN-132)
 * — the "suspend" counterpart to `RemoveMemberButton`'s permanent removal.
 * Same fetch/error/`router.refresh()` shape as `RemoveMemberButton` and
 * `ChangeRoleControl`, hitting the new `POST .../suspend` sub-route rather
 * than `DELETE` so a suspended member's membership row (and its `invited_by`/
 * `accepted_at` history) survives for `ReactivateMemberButton` to restore.
 */
export function SuspendMemberButton({ orgId, membershipId }: SuspendMemberButtonProps): React.ReactElement {
  const t = useTranslations('Members');
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick(): Promise<void> {
    setError(null);
    setSubmitting(true);
    try {
      const response = await fetch(`/api/orgs/${orgId}/members/${membershipId}/suspend`, { method: 'POST' });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        setError(body?.error === 'last_owner' ? t('suspendLastOwnerError') : t('suspendError'));
        return;
      }
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button type="button" variant="outline" size="sm" onClick={handleClick} disabled={submitting}>
        {t('suspend')}
      </Button>
      {error ? (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
