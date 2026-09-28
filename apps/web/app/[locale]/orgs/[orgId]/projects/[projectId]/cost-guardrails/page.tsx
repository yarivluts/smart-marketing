import { notFound, redirect } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { can } from '@growthos/shared';
import { Ban, BarChart3, CircleDollarSign, Database, Gauge, ListOrdered, PieChart, ScrollText, ShieldCheck, SlidersHorizontal } from 'lucide-react';
import { DEFAULT_QUERY_COST_LOG_LIST_LIMIT, type QueryCostLogOutcome } from '@growthos/firebase-orm-models';
import { getServerSession } from '@/lib/auth/get-server-session';
import { resolveOrgSessionContext } from '@/lib/orgs/session-context';
import { findActiveMembership } from '@/lib/orgs/access';
import { splitOverFetchedFeed } from '@/lib/orgs/capped-list-view';
import { checkProjectQueryQuota, getProjectCostQuota, listOrgProjects, listQueryCostLogEntriesForProject } from '@/lib/orgs/queries';
import {
  breakdownCostLog,
  formatEstimatedCostUsd,
  formatLabels,
  outcomeLabelKey,
  quotaUsagePct,
  summariseLoggedCost,
  toProjectCostQuotaView,
  toQueryCostLogEntryView,
} from '@/lib/orgs/cost-guardrail-view';
import { SetCostQuotaForm } from '@/components/orgs/set-cost-quota-form';
import { StatCard } from '@/components/ui/stat-card';
import { BarList, ChartCard, DonutChart, EmptyState, PageHero, STATUS_TOKENS, TrendChart, type VizStatus } from '@/components/viz';
import { cn } from '@/lib/utils';

type PageProps = Readonly<{
  params: Promise<{ locale: string; orgId: string; projectId: string }>;
}>;

export async function generateMetadata({ params }: PageProps) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'CostGuardrails' });
  return { title: t('metaTitle') };
}

const OUTCOMES: readonly QueryCostLogOutcome[] = ['executed', 'warehouse_not_configured', 'blocked_quota_exceeded'];
const OUTCOME_TONE: Record<QueryCostLogOutcome, VizStatus> = { executed: 'ok', warehouse_not_configured: 'warn', blocked_quota_exceeded: 'error' };
const OUTCOME_COLOR: Record<QueryCostLogOutcome, string> = {
  executed: 'hsl(var(--success))',
  warehouse_not_configured: 'hsl(var(--warning))',
  blocked_quota_exceeded: 'hsl(var(--destructive))',
};

/**
 * A project's KAN-39 cost guardrails (plan `13 §E4.3`): the daily query
 * quota + labels config a real BigQuery job would carry, today's usage
 * against that quota, and the query cost log every non-cache-hit
 * `queryMetrics` call writes to — the AC's "cost per project visible on an
 * internal dashboard". Gated on `project.manage`, the same per-project
 * admin-config permission `project_admin` already holds — see
 * `cost-guardrails/quota/route.ts`'s own doc comment for why that permission
 * over `metrics.write`/`billing.manage`.
 *
 * The gauge is today's attempts against the limit; the charts are computed over exactly the
 * log entries listed, so they carry the same "most recent N" scope as the list itself.
 */
export default async function CostGuardrailsPage({ params }: PageProps): Promise<React.ReactElement> {
  const { locale, orgId, projectId } = await params;
  setRequestLocale(locale);

  const session = await getServerSession();
  if (!session) {
    redirect(`/${locale}/login?from=%2Forgs%2F${orgId}%2Fprojects%2F${projectId}%2Fcost-guardrails`);
  }

  const { user, memberships, bindings } = await resolveOrgSessionContext(session);
  const membership = findActiveMembership(memberships, orgId);
  if (!membership || !can(bindings, { type: 'user', id: user.id }, 'project.manage', { orgId, projectId })) {
    notFound();
  }

  const [projects, quota, logEntries] = await Promise.all([
    listOrgProjects(orgId),
    getProjectCostQuota(orgId, projectId),
    listQueryCostLogEntriesForProject(orgId, projectId, DEFAULT_QUERY_COST_LOG_LIST_LIMIT + 1),
  ]);
  const project = projects.find((candidate) => candidate.id === projectId);
  if (!project) {
    notFound();
  }

  // Passes the quota already fetched above so this doesn't re-read the same ProjectCostQuotaModel doc a second time.
  const quotaStatus = await checkProjectQueryQuota(orgId, projectId, quota);

  const quotaView = toProjectCostQuotaView(quota);
  // Sliced BEFORE the total is computed, so "across these entries" means exactly
  // the entries rendered. Over-fetching by one measures truncation instead of
  // guessing it from length - and the truncation note is what makes the total's
  // own scoping ("across these entries") interpretable, since a reader who
  // believes the list is complete reads that total as the project's spend.
  const costPage = splitOverFetchedFeed(logEntries, DEFAULT_QUERY_COST_LOG_LIST_LIMIT);
  const logViews = costPage.rows.map(toQueryCostLogEntryView);

  /*
    What these queries actually cost.

    The page is called Cost Guardrails and the guardrail it enforces is a query COUNT - the
    daily limit is a number of attempts, not a spend cap. Meanwhile every executed query logs
    a real estimatedCostUsd, derived from the bytes BigQuery reported processing, and the page
    printed each one individually and never added them up. So the one question the page's own
    name promises to answer - what is this costing - was the one thing it did not say.

    Totalled only over the entries listed, and only over those that carry an estimate: an
    entry that ran on an executor which does not report bytes processed (DuckDB in dev, and
    any blocked or failed attempt) has no cost to add. Stating how many of the entries are
    represented keeps the total from being read as complete, which matters more here than the
    number itself - a spend figure that silently omits half its inputs is worse than none.
  */
  const loggedCost = summariseLoggedCost(logViews);
  const breakdown = breakdownCostLog(logViews);
  const usagePct = quotaUsagePct(quotaStatus);
  const usageTone: VizStatus = usagePct >= 90 ? 'error' : usagePct >= 70 ? 'warn' : 'ok';

  const t = await getTranslations('CostGuardrails');
  const integer = new Intl.NumberFormat(locale);
  const shortDay = new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric', timeZone: 'UTC' });
  const dateTime = new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: 'UTC' });
  const formatDay = (day: string): string => {
    const parsed = new Date(`${day}T00:00:00Z`);
    return Number.isNaN(parsed.getTime()) ? day : shortDay.format(parsed);
  };
  const formatAt = (iso: string): string => {
    const parsed = new Date(iso);
    return Number.isNaN(parsed.getTime()) ? iso : dateTime.format(parsed);
  };

  return (
    <div className="container mx-auto flex max-w-6xl flex-col gap-6 py-10">
      <PageHero icon={ShieldCheck} eyebrow={t('eyebrow')} title={t('title', { projectName: project.name })} description={t('heroDescription')}>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard
            title={t('kpiUsedToday')}
            value={t('kpiUsedValue', { attempted: integer.format(quotaStatus.attemptedToday), limit: integer.format(quotaStatus.limit) })}
            icon={Gauge}
            progress={usagePct}
          />
          <StatCard title={t('kpiRemaining')} value={integer.format(quotaStatus.remaining)} icon={Database} subtext={quotaStatus.allowed ? t('kpiRemainingOpen') : t('kpiRemainingBlocked')} />
          <StatCard
            title={t('kpiLoggedCost')}
            value={loggedCost.entriesWithCost > 0 ? formatEstimatedCostUsd(loggedCost.totalUsd) : t('kpiNoValue')}
            icon={CircleDollarSign}
            subtext={t('kpiLoggedCostSub', { count: logViews.length })}
          />
          <StatCard title={t('kpiBlocked')} value={integer.format(breakdown.byOutcome.blocked_quota_exceeded)} icon={Ban} subtext={t('kpiLoggedCostSub', { count: logViews.length })} />
        </div>
      </PageHero>

      <div className="grid gap-6 lg:grid-cols-5">
        <ChartCard title={t('usageHeading')} description={t('usageDescription')} icon={Gauge} className="lg:col-span-2" fill>
          <div className="flex flex-col items-center gap-4">
            <DonutChart
              label={t('usageHeading')}
              layout="stacked"
              size={180}
              centerValue={t('usagePercent', { percent: usagePct })}
              centerLabel={t('usageCenterLabel')}
              data={[
                { label: t('usageUsedSlice'), value: Math.min(quotaStatus.attemptedToday, quotaStatus.limit), color: `hsl(var(--${usageTone === 'ok' ? 'primary' : usageTone === 'warn' ? 'warning' : 'destructive'}))` },
                { label: t('usageRemainingSlice'), value: quotaStatus.remaining, color: 'hsl(var(--muted))' },
              ]}
            />
            <p className="text-center text-sm text-muted-foreground">
              {t('usageLine', { attempted: quotaStatus.attemptedToday, limit: quotaStatus.limit, remaining: quotaStatus.remaining })}
            </p>
            {quotaView.setAt ? (
              <p className="text-center text-xs text-muted-foreground">{t('labelsCurrent', { labels: formatLabels(quotaView.labels) || t('noLabels') })}</p>
            ) : (
              <p className="text-center text-xs text-muted-foreground">{t('defaultQuotaNote')}</p>
            )}
          </div>
        </ChartCard>
        <ChartCard title={t('setQuotaHeading')} description={t('setQuotaDescription')} icon={SlidersHorizontal} className="lg:col-span-3" fill>
          <SetCostQuotaForm orgId={orgId} projectId={projectId} dailyQueryLimit={quotaView.dailyQueryLimit} labels={quotaView.labels} />
        </ChartCard>
      </div>

      {logViews.length > 0 ? (
        <>
          <div className="grid gap-6 lg:grid-cols-5">
            <ChartCard title={t('perDayTitle')} description={t('perDayDescription', { count: logViews.length })} icon={BarChart3} className="lg:col-span-3" fill>
              <TrendChart
                label={t('perDayTitle')}
                kind="bar"
                stacked
                xKey="day"
                height={240}
                data={breakdown.byDay.map((row) => ({
                  day: formatDay(row.day),
                  executed: row.executed,
                  warehouse_not_configured: row.warehouse_not_configured,
                  blocked_quota_exceeded: row.blocked_quota_exceeded,
                }))}
                series={OUTCOMES.map((outcome) => ({ key: outcome, label: t(outcomeLabelKey(outcome)), color: OUTCOME_COLOR[outcome] }))}
                showLegend
              />
            </ChartCard>
            <ChartCard title={t('outcomesTitle')} description={t('outcomesDescription')} icon={PieChart} className="lg:col-span-2" fill>
              <DonutChart
                label={t('outcomesTitle')}
                layout="stacked"
                size={160}
                centerValue={integer.format(logViews.length)}
                centerLabel={t('outcomesCenterLabel')}
                data={OUTCOMES.filter((outcome) => breakdown.byOutcome[outcome] > 0).map((outcome) => ({
                  label: t(outcomeLabelKey(outcome)),
                  value: breakdown.byOutcome[outcome],
                  color: OUTCOME_COLOR[outcome],
                }))}
              />
            </ChartCard>
          </div>

          {breakdown.topDefinitions.length > 0 ? (
            <ChartCard title={t('topMetricsTitle')} description={t('topMetricsDescription')} icon={ListOrdered}>
              <BarList
                items={breakdown.topDefinitions.map((row) => ({ key: row.definition, label: row.definition, value: row.count }))}
                valueFormatter={(value) => t('queriesCount', { count: value })}
                maxItems={8}
                moreLabel={(hidden) => t('moreMetrics', { count: hidden })}
              />
            </ChartCard>
          ) : null}
        </>
      ) : null}

      <ChartCard
        title={t('logHeading')}
        description={costPage.truncated ? t('logCapNoteTruncated', { count: logViews.length }) : t('logCapNote', { count: logViews.length })}
        icon={ScrollText}
        footer={
          logViews.length > 0 ? (
            <div className="flex flex-col gap-1">
              {loggedCost.entriesWithCost > 0 ? (
                <p className="text-sm font-medium text-foreground">{t('loggedCostTotal', { total: formatEstimatedCostUsd(loggedCost.totalUsd) })}</p>
              ) : (
                <p className="text-sm">{t('loggedCostNone')}</p>
              )}
              {loggedCost.isPartial ? <p>{t('loggedCostPartial', { withCost: loggedCost.entriesWithCost, total: loggedCost.totalEntries })}</p> : null}
            </div>
          ) : undefined
        }
      >
        {logViews.length === 0 ? (
          <EmptyState compact icon={ScrollText} title={t('noLogEntries')} />
        ) : (
          <div className="max-h-[32rem] overflow-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-card">
                <tr className="border-b border-border text-xs text-muted-foreground">
                  <th className="py-2 pe-3 text-start font-medium">{t('columnTime')}</th>
                  <th className="py-2 pe-3 text-start font-medium">{t('columnOutcome')}</th>
                  <th className="py-2 pe-3 text-start font-medium">{t('columnMetrics')}</th>
                  <th className="py-2 text-end font-medium">{t('columnCost')}</th>
                </tr>
              </thead>
              <tbody>
                {logViews.map((entry) => {
                  const tone = STATUS_TOKENS[OUTCOME_TONE[entry.outcome]];
                  const definitions = Object.values(entry.definitionRefs);
                  return (
                    <tr key={entry.id} className="border-b border-border/60 align-top last:border-0">
                      <td className="whitespace-nowrap py-2 pe-3 tabular-nums text-muted-foreground" title={entry.executedAt}>
                        {formatAt(entry.executedAt)}
                      </td>
                      <td className="py-2 pe-3">
                        <span className={cn('inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium', tone.soft, tone.text)}>
                          <span className={cn('h-1.5 w-1.5 rounded-full', tone.dot)} aria-hidden="true" />
                          {t(outcomeLabelKey(entry.outcome))}
                        </span>
                      </td>
                      <td className="py-2 pe-3">
                        {definitions.length > 0 ? (
                          <span className="flex flex-wrap gap-1" dir="ltr">
                            {definitions.map((definition) => (
                              <span key={definition} className="rounded-md bg-muted px-1.5 py-0.5 font-mono text-[11px] text-foreground">
                                {definition}
                              </span>
                            ))}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">{t('logEntryNoDefinitions')}</span>
                        )}
                      </td>
                      <td className="whitespace-nowrap py-2 text-end tabular-nums" dir="ltr">
                        {entry.estimatedCostUsd !== null ? formatEstimatedCostUsd(entry.estimatedCostUsd) : <span className="text-muted-foreground">{t('costUnknownShort')}</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </ChartCard>
    </div>
  );
}
