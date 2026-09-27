'use client';

import { useTranslations } from 'next-intl';
import { AlertTriangle, ArrowDown, CheckCircle2, CircleDashed, History, ListChecks } from 'lucide-react';
import { customerBackfillEvidence, getSetupRequirement, type SetupEnvironmentHealth, type SetupRequirementStatus } from '@growthos/shared';
import { ProgressRing } from '@/components/viz/progress-ring';
import { cn } from '@/lib/utils';

export interface SetupHealthPanelProps {
  /** One environment's derived setup health (`evaluateProjectSetupHealth`, restricted to the picked environment). */
  health: SetupEnvironmentHealth;
  /** The environment's translated display name. */
  environmentLabel: string;
  /** In-page anchor of the Backfill panel when it is rendered for this viewer; without it the hint names the fix but links nowhere. */
  backfillHref?: string;
}

const STATUS_STYLE: Record<SetupRequirementStatus, { icon: typeof CheckCircle2; iconClass: string; pill: string; row: string }> = {
  connected: {
    icon: CheckCircle2,
    iconClass: 'bg-success/10 text-success',
    pill: 'bg-success/10 text-success',
    row: 'border-border',
  },
  error: {
    icon: AlertTriangle,
    iconClass: 'bg-destructive/10 text-destructive',
    pill: 'bg-destructive/10 text-destructive',
    row: 'border-destructive/40 bg-destructive/[0.03]',
  },
  gap: {
    icon: CircleDashed,
    iconClass: 'bg-muted text-muted-foreground',
    pill: 'bg-muted text-muted-foreground',
    row: 'border-dashed border-border',
  },
};

function quoted(names: readonly string[]): string {
  return names.map((name) => `"${name}"`).join(', ');
}

/** The ring's colour follows how much is connected, so a mostly-missing setup never reads as healthy. */
function ringColor(score: number): string {
  if (score >= 100) return 'hsl(var(--success))';
  if (score >= 50) return 'hsl(var(--primary))';
  return 'hsl(var(--warning))';
}

/**
 * KAN-197's read-only admin view of the setup requirements, for the environment picked in the
 * project shell: the same derivation the get_setup_health / audit_installation_gaps MCP tools
 * return. There is nothing to manage here - a status can only change by records being accepted
 * or rejected - so the panel shows, per requirement, what was received and why that gives it its
 * status, and what is lost while it is missing. Rendered as a checklist with a completion ring so
 * the gaps are visible at a glance.
 */
export function SetupHealthPanel({ health, environmentLabel, backfillHref }: SetupHealthPanelProps): React.ReactElement {
  const t = useTranslations('SetupHealth');
  const errorCount = health.requirements.filter((result) => result.status === 'error').length;
  const gapCount = health.requirements.filter((result) => result.status === 'gap').length;
  const backfillEvidence = customerBackfillEvidence(health);

  return (
    <section className="flex flex-col gap-5 rounded-2xl border border-border bg-card p-5 shadow-sm" aria-labelledby="setup-health-heading">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <ListChecks className="h-4 w-4" aria-hidden="true" />
        </div>
        <div className="min-w-0">
          <h2 id="setup-health-heading" className="text-base font-semibold text-foreground">
            {t('heading')}
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">{t('panelDescription')}</p>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[15rem_1fr]">
        <div className="flex flex-col items-center gap-3 rounded-xl border border-border bg-muted/30 p-4 text-center">
          <ProgressRing
            percent={health.score}
            label={t('ringLabel', { connected: health.connectedCount, total: health.totalCount })}
            centerValue={`${health.connectedCount}/${health.totalCount}`}
            centerLabel={t('ringCenter')}
            color={ringColor(health.score)}
            size={128}
          />
          <p className="text-sm font-medium text-foreground">
            {t('summaryLine', { connected: health.connectedCount, total: health.totalCount, environment: environmentLabel })}
          </p>
          <div className="w-full">
            <div className="mb-1 flex justify-between text-xs text-muted-foreground">
              <span>{t('coreLabel')}</span>
              <span dir="ltr">
                {health.coreConnectedCount}/{health.coreTotalCount}
              </span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-muted" aria-hidden="true">
              <div
                className="h-full rounded-full bg-primary transition-all duration-500"
                style={{ width: `${health.coreTotalCount > 0 ? (health.coreConnectedCount / health.coreTotalCount) * 100 : 0}%` }}
              />
            </div>
          </div>
          {errorCount + gapCount > 0 ? <p className="text-xs text-muted-foreground">{t('breakdownLine', { error: errorCount, gap: gapCount })}</p> : null}
        </div>

        <ul className="grid gap-2 md:grid-cols-2">
          {health.requirements.map((result) => {
            const style = STATUS_STYLE[result.status];
            const Icon = style.icon;
            const importance = getSetupRequirement(result.requirementId).importance;
            return (
              <li
                key={result.requirementId}
                className={cn('flex gap-3 rounded-xl border px-3 py-3 text-sm', style.row)}
                data-testid={`setup-requirement-${result.requirementId}`}
                data-status={result.status}
              >
                <span className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-full', style.iconClass)} aria-hidden="true">
                  <Icon className="h-4 w-4" />
                </span>
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="flex min-w-0 flex-wrap items-center gap-2">
                      <span className="font-medium text-foreground">{t(`requirements.${result.requirementId}.title`)}</span>
                      <span className="rounded-full border border-border px-1.5 py-px text-[10px] uppercase tracking-wide text-muted-foreground">
                        {t(`importance.${importance}`)}
                      </span>
                    </span>
                    <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium', style.pill)}>{t(`status.${result.status}`)}</span>
                  </div>
                  {result.status === 'connected' ? (
                    <span className="break-words text-xs text-muted-foreground">
                      {t('acceptedLine', { schemas: quoted(result.acceptedSchemas.map((schema) => schema.name)), lastAcceptedAt: result.lastAcceptedAt ?? '' })}
                    </span>
                  ) : null}
                  {result.rejectedSchemas.length > 0 ? (
                    <span className={cn('break-words text-xs', result.status === 'error' ? 'text-destructive' : 'text-muted-foreground')}>
                      {t('rejectedLine', {
                        count: result.rejectedSchemas.reduce((sum, schema) => sum + schema.openQuarantinedCount, 0),
                        schemas: quoted(result.rejectedSchemas.map((schema) => schema.name)),
                        reasons: result.quarantineReasons.join('; '),
                      })}
                    </span>
                  ) : null}
                  {result.status === 'gap' ? (
                    <span className="break-words text-xs text-muted-foreground">
                      {result.silentRegisteredSchemas.length > 0
                        ? t('silentRegisteredLine', { schemas: quoted(result.silentRegisteredSchemas) })
                        : t('nothingReceivedLine')}
                    </span>
                  ) : null}
                  {result.status !== 'connected' ? <span className="text-xs text-muted-foreground/80">{t(`requirements.${result.requirementId}.impact`)}</span> : null}
                  {result.requirementId === 'customer_profiles' && backfillEvidence ? (
                    <div className="mt-1 flex flex-col gap-1.5 rounded-lg border border-primary/30 bg-primary/5 px-2.5 py-2 text-xs" data-testid="setup-backfill-hint">
                      <span className="flex gap-1.5 text-foreground">
                        <History className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" aria-hidden="true" />
                        <span className="break-words">{t('backfillHint', { schemas: quoted(backfillEvidence) })}</span>
                      </span>
                      {backfillHref ? (
                        <a href={backfillHref} className="inline-flex items-center gap-1 self-start font-medium text-primary hover:underline">
                          {t('backfillLink')}
                          <ArrowDown className="h-3 w-3" aria-hidden="true" />
                        </a>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      </div>

      <div className="flex flex-col gap-1 border-t border-border/60 pt-3">
        <p className="text-xs text-muted-foreground">{t('sourceNote')}</p>
        <p className="text-xs text-muted-foreground" data-testid="setup-health-mapping-note">
          {t('mappingNote')}
        </p>
      </div>
    </section>
  );
}
