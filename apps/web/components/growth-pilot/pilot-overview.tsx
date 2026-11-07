'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { ArrowLeft, CheckCircle2, Hand, Loader2, Sparkles } from 'lucide-react';
import type { GrowthPerformanceTotals } from '@growthos/shared';
import { growthNextDecision, growthPilotOverview, type GrowthNextDecision } from '@/lib/growth-pilot/progress';
import type { GrowthPilotPageData } from '@/lib/growth-pilot/view';
import { isolate } from '@/lib/bidi';

/** A progress bar with its percentage, labelled for screen readers. */
export function ProgressBar({ percent, label, size = 'md' }: { percent: number; label: string; size?: 'md' | 'lg' }): React.ReactElement {
  return (
    <div className={size === 'lg' ? 'h-3 overflow-hidden rounded-full bg-muted' : 'h-2 overflow-hidden rounded-full bg-muted'} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent} aria-label={label}>
      <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${percent}%` }} />
    </div>
  );
}

/**
 * The one decision that matters most now, in plain words, with the way to it: the proposal on this
 * page (`#proposal-<id>`), or connecting the Meta ad account. Says so plainly when nothing waits.
 */
export function NextDecisionLine({ decision, names, metaConnectHref, working, proposalHref }: { decision: GrowthNextDecision; names: Record<string, string>; metaConnectHref: string | null; working: boolean; proposalHref?: (proposalId: string) => string }): React.ReactElement {
  const t = useTranslations('GrowthPilot.overview');
  if (!decision) {
    return (
      <p className="flex items-center gap-2 text-sm text-muted-foreground" data-testid="growth-pilot-next" data-next="none">
        {working ? <Loader2 className="h-4 w-4 shrink-0 animate-spin text-primary" aria-hidden="true" /> : <CheckCircle2 className="h-4 w-4 shrink-0 text-success" aria-hidden="true" />}
        {t(working ? 'nextWorking' : 'nextNone')}
      </p>
    );
  }
  const name = isolate(decision.kind === 'proposal' ? (decision.proposal.draft?.name ?? names[decision.proposal.targetId ?? ''] ?? '') : decision.target.name);
  const words = decision.kind === 'proposal' ? t(`next.${decision.proposal.kind}`, { name }) : t('next.connect_meta', { name });
  const href = decision.kind === 'proposal' ? (proposalHref ?? ((id: string) => `#proposal-${id}`))(decision.proposal.id) : metaConnectHref;
  return (
    <div className="flex flex-col gap-2 rounded-2xl border border-primary/30 bg-primary/5 p-3 sm:flex-row sm:items-center sm:justify-between" data-testid="growth-pilot-next" data-next={decision.kind === 'proposal' ? decision.proposal.kind : 'connect_meta'}>
      <p className="flex items-start gap-2 text-sm font-medium">
        <Hand className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
        <span>
          <span className="block text-xs font-semibold uppercase tracking-wide text-primary">{t('nextTitle')}</span>
          <span dir="auto">{words}</span>
        </span>
      </p>
      {href ? (
        <a href={href} className="inline-flex h-9 shrink-0 items-center justify-center gap-1.5 self-start rounded-full bg-primary px-4 text-sm font-semibold text-primary-foreground sm:self-auto" data-testid="growth-pilot-next-go">
          {t(decision.kind === 'proposal' ? 'go' : 'connect')}
          <ArrowLeft className="h-4 w-4 ltr:rotate-180" aria-hidden="true" />
        </a>
      ) : null}
    </div>
  );
}

/**
 * The top of the Growth Pilot page: how far everything got, how many steps are done, in progress and
 * waiting for the person, and the single most important decision now.
 */
export function GrowthPilotOverviewCard({ data, results, metaConnectHref, working }: { data: GrowthPilotPageData; results?: Record<string, GrowthPerformanceTotals> | null; metaConnectHref: string | null; working: boolean }): React.ReactElement | null {
  const t = useTranslations('GrowthPilot.overview');
  const overview = growthPilotOverview(data, results);
  if (overview.targets === 0 && overview.waiting === 0) return null;
  const decision = growthNextDecision(data, { canConnectMeta: Boolean(metaConnectHref) });
  const names = Object.fromEntries(data.targets.map((target) => [target.id, target.name]));
  const counts = [
    { key: 'done', value: overview.done, tone: 'bg-success/10 text-success' },
    { key: 'inProgress', value: overview.inProgress, tone: 'bg-primary/10 text-primary' },
    { key: 'waiting', value: overview.waiting, tone: overview.waiting ? 'bg-warning/15 text-warning' : 'bg-muted text-muted-foreground' },
  ] as const;
  return (
    <section className="flex flex-col gap-4 rounded-3xl border border-border/60 bg-card p-5 shadow-soft" aria-labelledby="growth-pilot-overview" data-testid="growth-pilot-overview">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <h2 id="growth-pilot-overview" className="flex items-center gap-2 font-pp-display text-base font-semibold">
          <Sparkles className="h-4 w-4 text-primary" aria-hidden="true" />
          {t('title')}
        </h2>
        <span className="font-pp-display text-2xl font-bold tabular-nums" data-testid="growth-pilot-overview-percent">
          {t('percent', { percent: overview.percent })}
        </span>
      </div>
      <ProgressBar percent={overview.percent} label={t('progressLabel')} />
      <p className="text-xs text-muted-foreground">{t('explain', { count: overview.targets })}</p>
      <ul className="flex flex-wrap gap-2">
        {counts.map((count) => (
          <li key={count.key} className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${count.tone}`} data-testid={`growth-pilot-overview-${count.key}`}>
            <span className="tabular-nums">{count.value}</span>
            {t(`counts.${count.key}`, { count: count.value })}
          </li>
        ))}
      </ul>
      <NextDecisionLine decision={decision} names={names} metaConnectHref={metaConnectHref} working={working} />
    </section>
  );
}
