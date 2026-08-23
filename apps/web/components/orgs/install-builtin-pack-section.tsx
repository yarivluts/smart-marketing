'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';

export interface InstallBuiltinPackOption {
  pluginId: string;
}

export interface InstallBuiltinPackSectionProps {
  orgId: string;
  projectId: string;
  /** Built-in packs not yet actively installed in this project — the caller filters with the same `hasActiveInstall` check `InstallPluginForm`'s registered-manifest gallery uses. */
  packs: readonly InstallBuiltinPackOption[];
}

const PACK_LABEL_KEYS: Record<string, { title: string; description: string }> = {
  'com.growthos.saas-marketing-metrics': { title: 'builtinPackSaasTitle', description: 'builtinPackSaasDescription' },
  'com.growthos.engagement-pack': { title: 'builtinPackEngagementTitle', description: 'builtinPackEngagementDescription' },
  'com.growthos.landing-page-pack': { title: 'builtinPackLandingPageTitle', description: 'builtinPackLandingPageDescription' },
  'com.growthos.feedback-pack': { title: 'builtinPackFeedbackTitle', description: 'builtinPackFeedbackDescription' },
  'com.growthos.churn-reason-pack': { title: 'builtinPackChurnReasonTitle', description: 'builtinPackChurnReasonDescription' },
  'com.growthos.quality-score-pack': { title: 'builtinPackQualityScoreTitle', description: 'builtinPackQualityScoreDescription' },
  'com.growthos.campaign-ops-pack': { title: 'builtinPackCampaignOpsTitle', description: 'builtinPackCampaignOpsDescription' },
};

/**
 * One-click install cards for this platform's built-in metric packs (SaaS,
 * Engagement, Landing Page) — the counterpart to `InstallPluginForm`'s
 * gallery for a human who never registered (or even seen) the pack's raw
 * `plugin.yaml`. No scope-consent screen and no config form: every built-in
 * pack declares `metrics:write` only and an empty `config_schema` (none of
 * them is a source connector needing credentials), so there is nothing here
 * for a human to actually decide — the same "one click, no form" posture
 * the onboarding wizard's own pack step already has (`onboarding-pack-step.tsx`).
 */
export function InstallBuiltinPackSection({ orgId, projectId, packs }: InstallBuiltinPackSectionProps): React.ReactElement {
  const t = useTranslations('ProjectPlugins');
  const router = useRouter();
  const [installingPluginId, setInstallingPluginId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function install(pluginId: string): Promise<void> {
    setError(null);
    setInstallingPluginId(pluginId);
    try {
      const response = await fetch(`/api/orgs/${orgId}/projects/${projectId}/plugins/builtin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pluginId }),
      });
      if (!response.ok) {
        setError(t('builtinPackInstallError'));
        return;
      }
      router.refresh();
    } finally {
      setInstallingPluginId(null);
    }
  }

  if (packs.length === 0) {
    return <p className="text-muted-foreground">{t('allBuiltinPacksInstalled')}</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {packs.map((pack) => {
          const labels = PACK_LABEL_KEYS[pack.pluginId];
          const installing = installingPluginId === pack.pluginId;
          return (
            <button
              key={pack.pluginId}
              type="button"
              onClick={() => install(pack.pluginId)}
              disabled={installingPluginId !== null}
              className="flex flex-col gap-2 rounded-md border border-input p-4 text-start shadow-sm transition-colors hover:border-primary disabled:opacity-60"
            >
              <span className="font-medium">{labels ? t(labels.title) : pack.pluginId}</span>
              <span className="text-sm text-muted-foreground">{labels ? t(labels.description) : null}</span>
              <span className="text-xs font-medium text-primary">{installing ? t('builtinPackInstalling') : t('builtinPackInstallButton')}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
