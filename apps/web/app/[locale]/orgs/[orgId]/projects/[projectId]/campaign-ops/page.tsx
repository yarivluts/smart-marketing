import { notFound, redirect } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { can } from '@growthos/shared';
import { CAMPAIGN_OPS_PACK_PLUGIN_ID, CAMPAIGN_SPEND_TRAILING_WINDOW_DAYS } from '@growthos/firebase-orm-models';
import { BadgeDollarSign, CircleDollarSign, DatabaseZap, Gauge, Layers, Scale, Target, TrendingUp, Workflow } from 'lucide-react';
import { getServerSession } from '@/lib/auth/get-server-session';
import { resolveOrgSessionContext } from '@/lib/orgs/session-context';
import { findActiveMembership } from '@/lib/orgs/access';
import {
  builtinMetricPacks,
  getCampaignPaybackBreakdownForProject,
  getCampaignSpendBreakdownForProject,
  getPaybackOverviewForProject,
  getQualityCalibrationBreakdownForProject,
  listOrgProjects,
  listPluginInstallsForProject,
} from '@/lib/orgs/queries';
import { resolveSelectedEnvironment } from '@/lib/orgs/selected-environment';
import { hasActiveInstall, toPluginInstallView } from '@/lib/orgs/plugin-view';
import {
  buildCampaignOpsFlow,
  CAMPAIGN_OPS_FLOW_EDGES,
  campaignSpendStatusLabelKey,
  campaignSpendStatusTone,
  spendTargetProgressPct,
  summariseSpendTargets,
} from '@/lib/orgs/campaign-ops-view';
import { signupQualityScoreTierLabelKey } from '@/lib/orgs/quality-score-view';
import { InstallBuiltinPackSection } from '@/components/orgs/install-builtin-pack-section';
import { CampaignTargetInput } from '@/components/orgs/campaign-target-input';
import { StatCard } from '@/components/ui/stat-card';
import { BarList, ChartCard, DonutChart, EmptyState, FlowDiagram, PageHero, STATUS_TOKENS, TrendChart } from '@/components/viz';
import { cn } from '@/lib/utils';

type PageProps = Readonly<{
  params: Promise<{ locale: string; orgId: string; projectId: string }>;
}>;

export async function generateMetadata({ params }: PageProps) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'CampaignOps' });
  return { title: t('metaTitle') };
}

/**
 * Campaign ops (KAN-86, E18.x, plan `14 §Gap 12`): a fixed-window payback
 * overview, a per-campaign `collection_40d`/`roi_40d` breakdown (2026-08-25
 * follow-up — the AC's own "true per-campaign roi_nd/collection_nd" bullet,
 * `getCampaignPaybackBreakdownForProject`), a predicted-vs-actual quality
 * calibration table (`quality_calibration_*`, the Campaign Ops pack), and a
 * per-campaign spend budget table with inline-editable targets driving
 * red/green (`ad_spend`-by-`campaign_id`, no pack install required —
 * `ad_spend` is the SaaS pack's own metric). Spend targets are independent
 * of the other three: a project can have spend targets with the Campaign
 * Ops pack never installed, and vice versa; the payback overview, the
 * per-campaign breakdown, and calibration all share one pack-install gate
 * since every one of them reads a mart that pack registers. Gated on
 * `dashboards.write`, the same permission Goals/Segments use for a
 * project-scoped editable-target admin surface.
 *
 * The flow diagram at the top is the same four outcomes drawn as one board: each stage's colour
 * is the outcome the page loaded, so an uninstalled pack or an unreachable warehouse reads as
 * exactly that.
 */
export default async function CampaignOpsPage({ params }: PageProps): Promise<React.ReactElement> {
  const { locale, orgId, projectId } = await params;
  setRequestLocale(locale);

  const session = await getServerSession();
  if (!session) {
    redirect(`/${locale}/login?from=%2Forgs%2F${orgId}%2Fprojects%2F${projectId}%2Fcampaign-ops`);
  }

  const { user, memberships, bindings } = await resolveOrgSessionContext(session);
  const membership = findActiveMembership(memberships, orgId);
  if (!membership || !can(bindings, { type: 'user', id: user.id }, 'dashboards.write', { orgId, projectId })) {
    notFound();
  }

  const [projects, installs] = await Promise.all([listOrgProjects(orgId), listPluginInstallsForProject(orgId, projectId)]);
  const project = projects.find((candidate) => candidate.id === projectId);
  if (!project) {
    notFound();
  }

  const installViews = installs.map(toPluginInstallView);
  const paybackPackInstalled = hasActiveInstall(installViews, CAMPAIGN_OPS_PACK_PLUGIN_ID);

  // KAN-196: every read below is scoped to the environment picked in the project shell (prod by default).
  const { selected: selectedEnvironment } = await resolveSelectedEnvironment(orgId, projectId);
  const environmentScope = { environmentId: selectedEnvironment?.id };
  const [paybackOutcome, campaignPaybackOutcome, spendOutcome, calibrationOutcome] = await Promise.all([
    paybackPackInstalled ? getPaybackOverviewForProject(orgId, projectId, environmentScope) : Promise.resolve(null),
    paybackPackInstalled ? getCampaignPaybackBreakdownForProject(orgId, projectId, environmentScope) : Promise.resolve(null),
    getCampaignSpendBreakdownForProject(orgId, projectId, environmentScope),
    paybackPackInstalled ? getQualityCalibrationBreakdownForProject(orgId, projectId, environmentScope) : Promise.resolve(null),
  ]);

  const t = await getTranslations('CampaignOps');
  const number = new Intl.NumberFormat(locale, { maximumFractionDigits: 2 });
  const compact = new Intl.NumberFormat(locale, { notation: 'compact', maximumFractionDigits: 1 });
  const percent = new Intl.NumberFormat(locale, { style: 'percent', maximumFractionDigits: 1 });

  const spendSummary = spendOutcome.ok ? summariseSpendTargets(spendOutcome.rows) : null;
  const collection40d = paybackOutcome?.ok ? paybackOutcome.windows.find((window) => window.windowDays === 40)?.collectedRevenue ?? null : null;
  const flow = buildCampaignOpsFlow({
    packInstalled: paybackPackInstalled,
    spend: spendOutcome,
    payback: paybackOutcome,
    campaignPayback: campaignPaybackOutcome,
    calibration: calibrationOutcome,
  });
  const targetedCount = spendSummary ? spendSummary.byStatus.over_target + spendSummary.byStatus.on_target : 0;
  const flowNodes = flow.map((node) => ({
    id: node.stage,
    label: t(`flowStage.${node.stage}`),
    status: node.status,
    sublabel: t(node.stateKey, { days: CAMPAIGN_SPEND_TRAILING_WINDOW_DAYS }),
    value:
      node.value === undefined
        ? undefined
        : node.stage === 'targets'
          ? t('flowTargetsValue', { over: node.value, targeted: targetedCount })
          : compact.format(node.value),
  }));
  const flowEdges = CAMPAIGN_OPS_FLOW_EDGES.map((edge) => {
    const reached = flow.find((node) => node.stage === edge.source)?.status === 'ok';
    return { ...edge, status: reached ? ('ok' as const) : ('idle' as const), animated: reached };
  });

  const installSection = (
    <InstallBuiltinPackSection orgId={orgId} projectId={projectId} packs={builtinMetricPacks().filter((pack) => pack.pluginId === CAMPAIGN_OPS_PACK_PLUGIN_ID)} />
  );

  return (
    <main className="container mx-auto flex max-w-6xl flex-col gap-6 py-10">
      <PageHero icon={Workflow} eyebrow={t('eyebrow')} title={t('title', { projectName: project.name })} description={t('description')}>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard title={t('kpiTrackedCampaigns')} value={spendSummary ? number.format(spendSummary.campaigns) : t('kpiNoValue')} icon={Layers} />
          <StatCard
            title={t('kpiSpend', { days: CAMPAIGN_SPEND_TRAILING_WINDOW_DAYS })}
            value={spendSummary && spendSummary.totalSpend !== null ? number.format(spendSummary.totalSpend) : t('kpiNoValue')}
            icon={CircleDollarSign}
          />
          <StatCard
            title={t('kpiOverTarget')}
            value={spendSummary && targetedCount > 0 ? number.format(spendSummary.byStatus.over_target) : t('kpiNoValue')}
            icon={Target}
            subtext={spendSummary && targetedCount > 0 ? t('kpiOnTargetSub', { count: spendSummary.byStatus.on_target }) : undefined}
          />
          <StatCard
            title={t('kpiCollection40d')}
            value={!paybackPackInstalled ? t('kpiPackNotInstalled') : collection40d !== null ? number.format(collection40d) : t('kpiNoValue')}
            icon={BadgeDollarSign}
          />
        </div>
      </PageHero>

      <ChartCard title={t('flowTitle')} description={t('flowDescription')} icon={Workflow}>
        <FlowDiagram label={t('flowTitle')} nodes={flowNodes} edges={flowEdges} height={300} />
      </ChartCard>

      <div className={cn('grid gap-6', paybackPackInstalled && 'lg:grid-cols-2')}>
        <ChartCard title={t('paybackHeading')} description={t('paybackDescription')} icon={TrendingUp} fill>
          {!paybackPackInstalled ? (
            installSection
          ) : !paybackOutcome || !paybackOutcome.ok ? (
            <EmptyState compact icon={DatabaseZap} title={t('paybackUnavailable')} />
          ) : (
            <TrendChart
              label={t('paybackHeading')}
              kind="bar"
              xKey="window"
              valueFormat="compact"
              height={240}
              data={paybackOutcome.windows.map((window) => ({ window: t('paybackWindowLabel', { days: window.windowDays }), collected: window.collectedRevenue }))}
              series={[{ key: 'collected', label: t('paybackSeries') }]}
            />
          )}
        </ChartCard>

        {paybackPackInstalled && (
          <ChartCard title={t('campaignPaybackHeading')} description={t('campaignPaybackDescription')} icon={Scale} fill>
            {!campaignPaybackOutcome || !campaignPaybackOutcome.ok ? (
              <EmptyState compact icon={DatabaseZap} title={t('campaignPaybackUnavailable')} />
            ) : campaignPaybackOutcome.rows.length === 0 ? (
              <EmptyState compact icon={Scale} title={t('campaignPaybackEmpty')} />
            ) : (
              <BarList
                items={campaignPaybackOutcome.rows.map((row) => ({
                  key: row.campaignId,
                  label: row.campaignId,
                  sublabel: t('roiSublabel', { roi: row.roi40d === null ? t('campaignPaybackNoData') : number.format(row.roi40d) }),
                  value: row.collectedRevenue40d,
                }))}
                valueFormatter={(value) => number.format(value)}
                maxItems={8}
                moreLabel={(hidden) => t('moreCampaigns', { count: hidden })}
                color="hsl(var(--success))"
              />
            )}
          </ChartCard>
        )}
      </div>

      {paybackPackInstalled && (
        <ChartCard title={t('calibrationHeading')} description={t('calibrationDescription')} icon={Gauge}>
          {!calibrationOutcome || !calibrationOutcome.ok ? (
            <EmptyState compact icon={DatabaseZap} title={t('calibrationUnavailable')} />
          ) : (
            <div className="grid gap-6 lg:grid-cols-5">
              <div className="lg:col-span-3">
                <TrendChart
                  label={t('columnPayingRate')}
                  kind="bar"
                  xKey="tier"
                  valueFormat="ratio"
                  height={220}
                  data={calibrationOutcome.tiers.map((tier) => ({ tier: t(signupQualityScoreTierLabelKey(tier.qualityTier)), rate: tier.payingRate }))}
                  series={[{ key: 'rate', label: t('columnPayingRate'), color: 'hsl(var(--info))' }]}
                />
              </div>
              <ul className="flex flex-col gap-2 lg:col-span-2">
                {calibrationOutcome.tiers.map((tier) => (
                  <li key={tier.qualityTier} className="flex items-center justify-between gap-3 rounded-xl border border-border bg-muted/30 px-4 py-3 text-sm">
                    <span className="flex flex-col">
                      <span className="font-medium text-foreground">{t(signupQualityScoreTierLabelKey(tier.qualityTier))}</span>
                      <span className="text-xs text-muted-foreground">{t('tierSignupsLine', { count: tier.signups })}</span>
                    </span>
                    <span className="flex flex-col items-end tabular-nums" dir="ltr">
                      <span className="font-semibold text-foreground">{tier.payingRate === null ? t('calibrationNoData') : percent.format(tier.payingRate)}</span>
                      <span className="text-xs text-muted-foreground">
                        {tier.avgCollectedRevenue40d === null ? t('calibrationNoData') : number.format(tier.avgCollectedRevenue40d)}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </ChartCard>
      )}

      <ChartCard title={t('spendTargetsHeading')} description={t('spendTargetsDescription', { days: CAMPAIGN_SPEND_TRAILING_WINDOW_DAYS })} icon={Target}>
        {!spendOutcome.ok ? (
          <EmptyState icon={DatabaseZap} title={t('spendTargetsUnavailable')} description={t('spendTargetsUnavailableHint')} />
        ) : spendOutcome.rows.length === 0 || !spendSummary ? (
          <EmptyState icon={Target} title={t('spendTargetsEmpty')} />
        ) : (
          <div className="grid gap-6 lg:grid-cols-3">
            <DonutChart
              label={t('statusMixTitle')}
              layout="stacked"
              size={160}
              centerValue={number.format(spendSummary.campaigns)}
              centerLabel={t('statusMixCenterLabel')}
              data={(['over_target', 'on_target', 'no_target', 'no_spend_data'] as const)
                .filter((status) => spendSummary.byStatus[status] > 0)
                .map((status) => ({
                  label: t(campaignSpendStatusLabelKey(status)),
                  value: spendSummary.byStatus[status],
                  color: status === 'over_target' ? 'hsl(var(--destructive))' : status === 'on_target' ? 'hsl(var(--success))' : status === 'no_target' ? 'hsl(var(--muted-foreground) / 0.5)' : 'hsl(var(--warning))',
                }))}
            />
            <div className="overflow-x-auto lg:col-span-2">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-start text-xs text-muted-foreground">
                    <th className="py-2 pe-3 text-start font-medium">{t('columnCampaign')}</th>
                    <th className="py-2 pe-3 text-start font-medium">{t('columnActualSpend')}</th>
                    <th className="py-2 pe-3 text-start font-medium">{t('columnTarget')}</th>
                    <th className="py-2 text-start font-medium">{t('columnStatus')}</th>
                  </tr>
                </thead>
                <tbody>
                  {spendOutcome.rows.map((row) => {
                    const progress = spendTargetProgressPct(row);
                    const tone = STATUS_TOKENS[campaignSpendStatusTone(row.status)];
                    return (
                      <tr key={row.campaignId} className="border-b border-border/60 last:border-0">
                        <td className="max-w-56 truncate py-3 pe-3 font-medium" title={row.campaignId}>
                          {row.campaignId}
                        </td>
                        <td className="min-w-36 py-3 pe-3">
                          <span className="tabular-nums">{row.actualSpend === null ? t('spendNoData') : number.format(row.actualSpend)}</span>
                          {progress !== null ? (
                            <span className="mt-1 block" title={t('spendProgressLabel', { percent: progress })}>
                              <span className="block h-1.5 w-full overflow-hidden rounded-full bg-muted">
                                <span className={cn('block h-full rounded-full', tone.dot)} style={{ width: `${Math.min(100, progress)}%` }} />
                              </span>
                              <span className="text-[11px] text-muted-foreground">{t('spendProgressLabel', { percent: progress })}</span>
                            </span>
                          ) : null}
                        </td>
                        <td className="py-3 pe-3">
                          <CampaignTargetInput orgId={orgId} projectId={projectId} campaignId={row.campaignId} monthlyBudget={row.monthlyBudget} />
                        </td>
                        <td className="py-3">
                          <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium', tone.soft, tone.text)}>
                            <span className={cn('h-1.5 w-1.5 rounded-full', tone.dot)} aria-hidden="true" />
                            {t(campaignSpendStatusLabelKey(row.status))}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </ChartCard>
    </main>
  );
}
