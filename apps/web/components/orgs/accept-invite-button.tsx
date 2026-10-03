'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { ArrowRight, Loader2 } from 'lucide-react';
import { useRouter } from '@/i18n/navigation';
import { PpButton } from '@/components/pastel/primitives';

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
    <div className="w-full flex flex-col items-center gap-3">
      <PpButton
        variant="primary"
        onClick={handleClick}
        disabled={submitting}
        className="w-full h-12 rounded-full font-pp-display text-pp-body-lg font-bold shadow-pp-candy active:scale-[0.98] transition-all flex items-center justify-center gap-2 cursor-pointer"
      >
        {submitting ? (
          <Loader2 className="h-5 w-5 animate-spin" />
        ) : (
          <>
            <span>{t('accept')}</span>
            <ArrowRight className="h-4 w-4 rtl:rotate-180" />
          </>
        )}
      </PpButton>
      {errorMessage ? (
        <p role="alert" className="text-pp-body-sm text-pp-error font-medium text-center">
          {errorMessage}
        </p>
      ) : null}
    </div>
  );
}
