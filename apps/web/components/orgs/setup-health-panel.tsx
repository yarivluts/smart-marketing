'use client';

import { useTranslations } from 'next-intl';
import type { SetupEnvironmentHealth, SetupRequirementStatus } from '@growthos/shared';

export interface SetupHealthPanelProps {
  /** One environment's derived setup health (`evaluateProjectSetupHealth`, restricted to the picked environment). */
  health: SetupEnvironmentHealth;
  /** The environment's translated display name. */
  environmentLabel: string;
}

const STATUS_TEXT_CLASS: Record<SetupRequirementStatus, string> = {
  connected: 'text-emerald-600 dark:text-emerald-400',
  error: 'text-destructive',
  gap: 'text-muted-foreground',
};

function quoted(names: readonly string[]): string {
  return names.map((name) => `"${name}"`).join(', ');
}

/**
 * KAN-197's read-only admin view of the setup requirements, for the environment picked in the
 * project shell: the same derivation the get_setup_health / audit_installation_gaps MCP tools
 * return. There is nothing to manage here - a status can only change by records being accepted
 * or rejected - so the panel shows, per requirement, what was received and why that gives it its
 * status, and what is lost while it is missing.
 */
export function SetupHealthPanel({ health, environmentLabel }: SetupHealthPanelProps): React.ReactElement {
  const t = useTranslations('SetupHealth');

  return (
    <section className="flex flex-col gap-3" aria-labelledby="setup-health-heading">
      <h2 id="setup-health-heading" className="text-lg font-semibold">
        {t('heading')}
      </h2>
      <p className="text-sm text-muted-foreground">
        {t('summaryLine', { connected: health.connectedCount, total: health.totalCount, environment: environmentLabel })}
      </p>
      <ul className="flex flex-col gap-2">
        {health.requirements.map((result) => (
          <li key={result.requirementId} className="flex flex-col gap-1 rounded-md border border-input px-3 py-2 text-sm" data-testid={`setup-requirement-${result.requirementId}`}>
            <div className="flex items-center justify-between gap-3">
              <span className="font-medium">{t(`requirements.${result.requirementId}.title`)}</span>
              <span className={`text-xs font-medium ${STATUS_TEXT_CLASS[result.status]}`}>{t(`status.${result.status}`)}</span>
            </div>
            {result.status === 'connected' ? (
              <span className="text-muted-foreground">
                {t('acceptedLine', { schemas: quoted(result.acceptedSchemas.map((schema) => schema.name)), lastAcceptedAt: result.lastAcceptedAt ?? '' })}
              </span>
            ) : null}
            {result.rejectedSchemas.length > 0 ? (
              <span className={result.status === 'error' ? 'text-destructive' : 'text-muted-foreground'}>
                {t('rejectedLine', {
                  count: result.rejectedSchemas.reduce((sum, schema) => sum + schema.openQuarantinedCount, 0),
                  schemas: quoted(result.rejectedSchemas.map((schema) => schema.name)),
                  reasons: result.quarantineReasons.join('; '),
                })}
              </span>
            ) : null}
            {result.status === 'gap' ? (
              <span className="text-muted-foreground">
                {result.silentRegisteredSchemas.length > 0
                  ? t('silentRegisteredLine', { schemas: quoted(result.silentRegisteredSchemas) })
                  : t('nothingReceivedLine')}
              </span>
            ) : null}
            {result.status !== 'connected' ? <span className="text-xs text-muted-foreground">{t(`requirements.${result.requirementId}.impact`)}</span> : null}
          </li>
        ))}
      </ul>
      <p className="text-xs text-muted-foreground">{t('sourceNote')}</p>
      <p className="text-xs text-muted-foreground" data-testid="setup-health-mapping-note">
        {t('mappingNote')}
      </p>
    </section>
  );
}
