'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import type { OnboardingPackKey } from '@growthos/firebase-orm-models';
import { useRouter } from '@/i18n/navigation';

export interface OnboardingPackOption {
  packKey: Exclude<OnboardingPackKey, 'custom'>;
  pluginId: string;
}

export interface OnboardingPackStepProps {
  orgId: string;
  projectId: string;
  packs: readonly OnboardingPackOption[];
}

const PACK_LABEL_KEYS: Record<Exclude<OnboardingPackKey, 'custom'>, { title: string; description: string }> = {
  saas_marketing: { title: 'packSaasMarketingTitle', description: 'packSaasMarketingDescription' },
  engagement: { title: 'packEngagementTitle', description: 'packEngagementDescription' },
};

/** The wizard's "pick a vertical/metric pack" step (plan `10 §2.6` step 1). */
export function OnboardingPackStep({ orgId, projectId, packs }: OnboardingPackStepProps): React.ReactElement {
  const t = useTranslations('Onboarding');
  const router = useRouter();
  const [submittingKey, setSubmittingKey] = useState<OnboardingPackKey | null>(null);
  const [error, setError] = useState(false);

  async function selectPack(packKey: OnboardingPackKey): Promise<void> {
    setError(false);
    setSubmittingKey(packKey);
    try {
      const response = await fetch(`/api/orgs/${orgId}/projects/${projectId}/onboarding/pack`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ packKey }),
      });
      if (!response.ok) {
        setError(true);
        return;
      }
      router.refresh();
    } finally {
      setSubmittingKey(null);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-muted-foreground">{t('packStepIntro')}</p>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {t('genericError')}
        </p>
      ) : null}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {packs.map((pack) => {
          const labels = PACK_LABEL_KEYS[pack.packKey];
          return (
            <button
              key={pack.packKey}
              type="button"
              onClick={() => selectPack(pack.packKey)}
              disabled={submittingKey !== null}
              className="flex flex-col gap-2 rounded-md border border-input p-4 text-start hover:border-primary disabled:opacity-60"
            >
              <span className="font-semibold">{t(labels.title)}</span>
              <span className="text-sm text-muted-foreground">{t(labels.description)}</span>
            </button>
          );
        })}
        <button
          type="button"
          onClick={() => selectPack('custom')}
          disabled={submittingKey !== null}
          className="flex flex-col gap-2 rounded-md border border-dashed border-input p-4 text-start hover:border-primary disabled:opacity-60"
        >
          <span className="font-semibold">{t('packCustomTitle')}</span>
          <span className="text-sm text-muted-foreground">{t('packCustomDescription')}</span>
        </button>
      </div>
      {submittingKey === 'saas_marketing' || submittingKey === 'engagement' ? (
        <p className="text-sm text-muted-foreground">{t('packInstalling')}</p>
      ) : null}
    </div>
  );
}
