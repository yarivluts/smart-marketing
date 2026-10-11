import * as React from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Activity, ArrowRight, ListChecks } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { cn } from '@/lib/utils';
import { Sparkline } from '@/components/viz/sparkline';
import { InitialsAvatar } from '@/components/viz/initials-avatar';
import { STATUS_TOKENS } from '@/components/viz/palette';
import { onboardingProgress, timeAgoParts } from '@/lib/orgs/workspace-view';
import type { DashboardProject } from '@/lib/orgs/dashboard-overview';

const REQUIREMENT_DOT: Record<string, string> = {
  connected: 'bg-success',
  error: 'bg-destructive',
  gap: 'bg-muted-foreground/30',
};

/**
 * One project on the dashboard: its live setup-health score (from the records it actually
 * accepted), per-requirement status, each environment's score, when data last arrived and how much
 * in the last two weeks, plus where to go next. A viewer without ingest access sees the project and
 * a note instead of numbers.
 */
export function ProjectHealthCard({ project, wide = false }: { project: DashboardProject; wide?: boolean }): React.ReactElement {
  const t = useTranslations('DashboardPage');
  const tSetup = useTranslations('SetupHealth');
  const tEnv = useTranslations('EnvBadge');
  const locale = useLocale();
  const numberFormat = new Intl.NumberFormat(locale, { notation: 'compact', maximumFractionDigits: 1 });
  const health = project.health;
  const status = health?.status ?? 'idle';
  const base = `/orgs/${project.orgId}/projects/${project.projectId}`;
  const progress = project.onboardingStep !== undefined ? onboardingProgress(project.onboardingStep) : null;
  const lastIngest =
    health?.minutesSinceIngest === null || health?.minutesSinceIngest === undefined
      ? t('cardNeverIngested')
      : (() => {
          const parts = timeAgoParts(health.minutesSinceIngest);
          return t(`cardAgo_${parts.unit}`, { value: parts.value });
        })();

  return (
    <article className="flex h-full flex-col rounded-2xl border border-border bg-card shadow-sm transition-shadow hover:shadow-md" data-testid={`project-card-${project.projectId}`}>
      <header className="flex items-start gap-3 px-5 pt-5">
        <InitialsAvatar name={project.name} seed={project.projectId} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="truncate text-base font-semibold text-foreground">{project.name}</h3>
            <span className={cn('h-2.5 w-2.5 shrink-0 rounded-full', STATUS_TOKENS[status].dot)} aria-hidden="true" />
            <span className="sr-only">{t(`cardStatus_${status}`)}</span>
          </div>
          <p className="truncate text-xs text-muted-foreground">{project.vertical ?? t('cardNoVertical')}</p>
        </div>
      </header>

      <div className="flex flex-1 flex-col gap-4 px-5 py-4">
        {health ? (
          <div className={cn('flex flex-col gap-4', wide && 'lg:grid lg:grid-cols-2 lg:gap-6')}>
            <div>
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-xs font-medium text-muted-foreground">
                  {health.headlineEnvironment ? t('cardSetupHealthIn', { environment: tEnv(health.headlineEnvironment) }) : t('cardSetupHealth')}
                </span>
                <span className="text-xs text-muted-foreground">{t('cardStreams', { connected: health.connectedCount, total: health.totalCount })}</span>
              </div>
              <div className="mt-1 flex items-center gap-3">
                <span className="text-3xl font-bold tabular-nums text-foreground" dir="ltr">
                  {health.score === null ? '-' : `${health.score}%`}
                </span>
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                  <div className="h-full rounded-full bg-emerald-gradient" style={{ width: `${health.score ?? 0}%` }} />
                </div>
              </div>
              {health.requirements.length > 0 ? (
                <ul className="mt-3 flex flex-wrap gap-1.5" aria-label={t('cardRequirementsLabel')}>
                  {health.requirements.map((requirement) => (
                    <li
                      key={requirement.id}
                      className="flex items-center gap-1.5 rounded-full border border-border bg-background/60 px-2 py-0.5 text-[11px] text-muted-foreground"
                      title={tSetup(`status.${requirement.status}`)}
                    >
                      <span className={cn('h-1.5 w-1.5 rounded-full', REQUIREMENT_DOT[requirement.status])} aria-hidden="true" />
                      {tSetup(`requirements.${requirement.id}.title`)}
                      <span className="sr-only">{`: ${tSetup(`status.${requirement.status}`)}`}</span>
                    </li>
                  ))}
                </ul>
              ) : null}
              {health.environments.length > 1 ? (
                <p className="mt-2 text-[11px] text-muted-foreground">
                  {t('cardEnvironments', { list: health.environments.map((environment) => `${tEnv(environment.name)} ${environment.score}%`).join(' · ') })}
                </p>
              ) : null}
            </div>

            <div className="flex flex-col gap-4">
            <dl className="grid grid-cols-3 gap-2 rounded-xl bg-muted/40 p-3 text-center">
              <div>
                <dt className="text-[11px] text-muted-foreground">{t('cardLastIngest')}</dt>
                <dd className="mt-0.5 text-sm font-semibold text-foreground">{lastIngest}</dd>
              </div>
              <div>
                <dt className="text-[11px] text-muted-foreground">{t('cardAccepted')}</dt>
                <dd className="mt-0.5 text-sm font-semibold tabular-nums text-foreground" dir="ltr">
                  {numberFormat.format(health.acceptedCount)}
                </dd>
              </div>
              <div>
                <dt className="text-[11px] text-muted-foreground">{t('cardRejected')}</dt>
                <dd className={cn('mt-0.5 text-sm font-semibold tabular-nums', health.quarantinedCount > 0 ? 'text-destructive' : 'text-foreground')} dir="ltr">
                  {numberFormat.format(health.quarantinedCount)}
                </dd>
              </div>
            </dl>
            {health.dailyAccepted.some((value) => value > 0) ? (
              <div>
                <Sparkline values={health.dailyAccepted} className="h-10" label={t('cardTrendLabel')} color="hsl(var(--success))" />
                <p className="mt-1 text-[11px] text-muted-foreground">{t('cardTrendLabel')}</p>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">{t('cardNoRecentData')}</p>
            )}
            </div>
          </div>
        ) : (
          <p className="rounded-xl border border-dashed border-border bg-muted/30 px-3 py-4 text-xs text-muted-foreground">
            {project.healthUnavailable ? t('cardHealthUnavailable') : t('cardHealthRestricted')}
          </p>
        )}
        {progress && project.onboardingStep !== 'done' ? (
          <div className="rounded-xl border border-warning/30 bg-warning/5 px-3 py-2">
            <div className="flex items-center justify-between gap-2 text-xs">
              <span className="font-medium text-foreground">{t('cardOnboarding', { completed: progress.completed, total: progress.total })}</span>
              <span className="tabular-nums text-muted-foreground" dir="ltr">
                {progress.percent}%
              </span>
            </div>
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full bg-warning" style={{ width: `${progress.percent}%` }} />
            </div>
          </div>
        ) : null}
      </div>

      <footer className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-border/60 px-5 py-3 text-sm">
        <Link href={`${base}/campaigns`} className="inline-flex items-center gap-1 font-medium text-primary hover:underline">
          {t('cardOpenProject')}
          <ArrowRight className="h-3.5 w-3.5 rtl:rotate-180" aria-hidden="true" />
        </Link>
        {health ? (
          <Link href={`${base}/ingest-health`} className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground">
            <Activity className="h-3.5 w-3.5" aria-hidden="true" />
            {t('cardIngestHealth')}
          </Link>
        ) : null}
        {progress && project.onboardingStep !== 'done' ? (
          <Link href={`${base}/onboarding`} className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground">
            <ListChecks className="h-3.5 w-3.5" aria-hidden="true" />
            {t('cardContinueSetup')}
          </Link>
        ) : null}
      </footer>
    </article>
  );
}
