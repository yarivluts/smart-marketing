'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';

export interface AcceptInviteButtonProps {
  orgId: string;
  membershipId: string;
}

export function AcceptInviteButton({ orgId, membershipId }: AcceptInviteButtonProps): React.ReactElement {
  const t = useTranslations('Invite');
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleClick(): Promise<void> {
    setErrorMessage(null);
    setSubmitting(true);
    try {
      const response = await fetch(`/api/invites/${orgId}/${membershipId}/accept`, { method: 'POST' });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        setErrorMessage(body?.error === 'email_not_verified' ? t('verifyEmailError') : t('acceptError'));
        return;
      }
      router.push(`/orgs/${orgId}`);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col items-center gap-2">
      <Button onClick={handleClick} disabled={submitting}>
        {t('accept')}
      </Button>
      {errorMessage ? (
        <p role="alert" className="text-sm text-destructive">
          {errorMessage}
        </p>
      ) : null}
    </div>
  );
}
