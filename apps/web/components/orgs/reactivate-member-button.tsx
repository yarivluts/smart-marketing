'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';

export interface ReactivateMemberButtonProps {
  orgId: string;
  membershipId: string;
}

/** Restores a suspended member's access — the reverse of `SuspendMemberButton`, hitting `POST .../reactivate`. */
export function ReactivateMemberButton({ orgId, membershipId }: ReactivateMemberButtonProps): React.ReactElement {
  const t = useTranslations('Members');
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick(): Promise<void> {
    setError(null);
    setSubmitting(true);
    try {
      const response = await fetch(`/api/orgs/${orgId}/members/${membershipId}/reactivate`, { method: 'POST' });
      if (!response.ok) {
        setError(t('reactivateError'));
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
        {t('reactivate')}
      </Button>
      {error ? (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
