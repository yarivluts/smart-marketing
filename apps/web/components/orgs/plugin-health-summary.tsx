'use client';

import { useTranslations } from 'next-intl';
import { pluginInstallHealthLabelKey, type PluginInstallHealth, type PluginInstallHealthStatus } from '@/lib/orgs/plugin-view';

export interface PluginHealthSummaryProps {
  health: PluginInstallHealth;
}

const HEALTH_STATUS_TEXT_CLASS: Record<PluginInstallHealthStatus, string> = {
  healthy: 'text-emerald-600 dark:text-emerald-400',
  degraded: 'text-destructive',
  neverRun: 'text-muted-foreground',
  running: 'text-muted-foreground',
  installed: 'text-emerald-600 dark:text-emerald-400',
  disabled: 'text-muted-foreground',
  uninstalled: 'text-muted-foreground',
};

/**
 * A source-type install's health-at-a-glance (KAN-48, plan `13 §E7.3`): the
 * `pluginInstallHealth` pure mapper's own reading — healthy/degraded/
 * running/never-run for a `source`-type install, or a non-`source` install's
 * plain lifecycle status — rendered as a small badge plus, when there is
 * one, the most recent successful sync's timestamp. Sits above the existing
 * (KAN-47) run-history list so an admin sees the current state without
 * reading every past run.
 */
export function PluginHealthSummary({ health }: PluginHealthSummaryProps): React.ReactElement {
  const t = useTranslations('ProjectPlugins');
  const labelKey = pluginInstallHealthLabelKey(health.status);

  return (
    <div className="flex flex-col gap-1 rounded-md border border-input bg-muted/30 px-3 py-2 text-sm">
      <div className="flex items-center gap-2">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t('healthHeading')}</span>
        <span className={`font-medium ${HEALTH_STATUS_TEXT_CLASS[health.status]}`}>{t(labelKey)}</span>
      </div>
      {health.lastSucceededAt ? (
        <span className="text-xs text-muted-foreground">{t('healthLastSucceededLine', { lastSucceededAt: health.lastSucceededAt })}</span>
      ) : null}
    </div>
  );
}
