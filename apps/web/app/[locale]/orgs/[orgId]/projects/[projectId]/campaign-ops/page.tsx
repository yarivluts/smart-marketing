import { notFound, redirect } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { can } from '@growthos/shared';
import { CAMPAIGN_OPS_PACK_PLUGIN_ID, CAMPAIGN_SPEND_TRAILING_WINDOW_DAYS } from '@growthos/firebase-orm-models';
import { getServerSession } from '@/lib/auth/get-server-session';
import { resolveOrgSessionContext } from '@/lib/orgs/session-context';
import { findActiveMembership } from '@/lib/orgs/access';
import {
  builtinMetricPacks,
  getCampaignPaybackBreakdownForProject,
  getCampaignSpendBreakdownForProject,
  getPaybackOverviewForProject,
  getQualityCalibrationBreakdownForProject,
  getCreativeFatigueTelemetryForProject,
  listOrgProjects,
  listPluginInstallsForProject,
} from '@/lib/orgs/queries';
import { hasActiveInstall, toPluginInstallView } from '@/lib/orgs/plugin-view';
import {
  campaignSpendStatusLabelKey,
  creativeFatigueLevelLabelKey,
  creativeFatiguePillAccent,
  creativeSwapActionLabelKey,
  creativeSwapActionPillAccent,
} from '@/lib/orgs/campaign-ops-view';
import { signupQualityScoreTierLabelKey } from '@/lib/orgs/quality-score-view';
import { InstallBuiltinPackSection } from '@/components/orgs/install-builtin-pack-section';
import { CampaignTargetInput } from '@/components/orgs/campaign-target-input';
import {
  PpPage,
  PpPageHeader,
  PpKpiGrid,
  PpKpiCard,
  PpCard,
  PpTable,
  PpEmptyState,
  PpPill,
} from '@/components/pastel/primitives';
import { TrendingUp, Activity, ShieldCheck, Target, Radar } from 'lucide-react';

type PageProps = Readonly<{
  params: Promise<{ locale: string; orgId: string; projectId: string }>;
}>;

export async function generateMetadata({ params }: PageProps) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'CampaignOps' });
  return { title: t('metaTitle') };
}

/**
 * Campaign ops (KAN-86, E18.x): Fixed-window payback overview, per-campaign 40d ROI breakdown,
 * predicted-vs-actual quality calibration table, and spend target controls.
 *
 * Converted to Stitch Pastel Pulse design (desktop 6bf1b35b, mobile eb811927), folding real
 * tables and controls without fabricated fatigue radar metrics.
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
  if (!membership || !can(bindings, { type: 'user', id: user.id }, 'dashboards.write', { orgId })) {
    notFound();
  }

  const [projects, installs] = await Promise.all([listOrgProjects(orgId), listPluginInstallsForProject(orgId, projectId)]);
  const project = projects.find((candidate) => candidate.id === projectId);
  if (!project) {
    if (projects.length > 0) {
      redirect(`/${locale}/orgs/${orgId}/projects/${projects[0].id}/campaign-ops`);
    }
    redirect(`/${locale}/orgs/${orgId}`);
  }

  const installViews = installs.map(toPluginInstallView);
  const paybackPackInstalled = hasActiveInstall(installViews, CAMPAIGN_OPS_PACK_PLUGIN_ID);

  const [paybackOutcome, campaignPaybackOutcome, spendOutcome, calibrationOutcome, creativeFatigue] = await Promise.all([
    paybackPackInstalled ? getPaybackOverviewForProject(orgId, projectId) : Promise.resolve(null),
    paybackPackInstalled ? getCampaignPaybackBreakdownForProject(orgId, projectId) : Promise.resolve(null),
    getCampaignSpendBreakdownForProject(orgId, projectId),
    paybackPackInstalled ? getQualityCalibrationBreakdownForProject(orgId, projectId) : Promise.resolve(null),
    getCreativeFatigueTelemetryForProject(orgId, projectId),
  ]);

  const hasSpendData = Boolean(spendOutcome.ok && spendOutcome.rows && spendOutcome.rows.length > 0);
  const isDataConnected = paybackPackInstalled || hasSpendData || creativeFatigue.hasData;

  const t = await getTranslations('CampaignOps');

  const overTargetCount = spendOutcome.ok ? spendOutcome.rows.filter((r) => r.status === 'over_target').length : 0;
  const totalTrackedSpend = spendOutcome.ok ? spendOutcome.rows.reduce((sum, r) => sum + r.actualSpend, 0) : 0;

  return (
    <PpPage>
      {/* 1. Header */}
      <PpPageHeader
        eyebrow="CAMPAIGN OPS & WEAR-OUT RADAR"
        meta={isDataConnected ? 'Multi-Channel Telemetry Active' : 'Awaiting Ingestion'}
        title={t('title', { projectName: project.name })}
        description={t('description')}
        actions={
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-pp-secondary-container/60 px-3 py-1.5 text-xs font-semibold text-pp-secondary">
              <span className="w-1.5 h-1.5 rounded-full bg-pp-secondary animate-pulse" />
              <span>{isDataConnected ? 'TELEMETRY LIVE' : 'NO LIVE DATA'}</span>
            </span>
          </div>
        }
      />

      {/* 2. Top KPI Deck */}
      <PpKpiGrid>
        <PpKpiCard
          label="Tracked Campaigns"
          value={spendOutcome.ok ? spendOutcome.rows.length : 0}
          valueSuffix="campaigns"
          badge={spendOutcome.ok ? `$${totalTrackedSpend.toLocaleString(locale)}` : undefined}
          accent="primary"
          footer={`Trailing ${CAMPAIGN_SPEND_TRAILING_WINDOW_DAYS} Days Spend Window`}
        />
        <PpKpiCard
          label="Campaign Ops Pack"
          value={paybackPackInstalled ? 'Installed' : 'Pack Required'}
          badge={paybackPackInstalled ? 'Active' : 'Not Installed'}
          badgeAccent={paybackPackInstalled ? 'mint' : 'amber'}
          accent={paybackPackInstalled ? 'mint' : 'amber'}
          footer="Payback & Calibration Marts"
        />
        <PpKpiCard
          label="Budget Health"
          value={overTargetCount}
          valueSuffix="over target"
          badge={overTargetCount > 0 ? 'Budget Alert' : 'On Target'}
          badgeAccent={overTargetCount > 0 ? 'error' : 'mint'}
          accent={overTargetCount > 0 ? 'error' : 'sky'}
          footer="Inline Editable Target Ceilings"
        />
        <PpKpiCard
          label="40-Day Payback"
          value={
            campaignPaybackOutcome && campaignPaybackOutcome.ok && campaignPaybackOutcome.rows.length > 0
              ? `${campaignPaybackOutcome.rows.length}`
              : '—'
          }
          valueSuffix={
            campaignPaybackOutcome && campaignPaybackOutcome.ok && campaignPaybackOutcome.rows.length > 0
              ? 'tracked'
              : undefined
          }
          badge={paybackPackInstalled ? '40D Mart' : 'No Pack'}
          badgeAccent={paybackPackInstalled ? 'pink' : 'neutral'}
          accent="pink"
          footer="Cohort Revenue Realization"
        />
      </PpKpiGrid>

      {/* 3. Payback Overview Section */}
      <PpCard
        title={t('paybackHeading')}
        subtitle="Cumulative customer cohort collection across standard maturity windows"
        icon={TrendingUp}
        iconAccent="primary"
      >
        {!paybackPackInstalled ? (
          <div className="space-y-4">
            <InstallBuiltinPackSection
              orgId={orgId}
              projectId={projectId}
              packs={builtinMetricPacks().filter((pack) => pack.pluginId === CAMPAIGN_OPS_PACK_PLUGIN_ID)}
            />
          </div>
        ) : !paybackOutcome || !paybackOutcome.ok ? (
          <PpEmptyState
            icon={TrendingUp}
            title={t('paybackHeading')}
            description={t('paybackUnavailable')}
          />
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {paybackOutcome.windows.map((window) => (
              <div
                key={window.windowDays}
                className="rounded-2xl bg-pp-subtle-inset p-4 space-y-1 text-start"
              >
                <span className="text-pp-label-sm text-pp-outline block uppercase tracking-wider">
                  {t('paybackWindowLabel', { days: window.windowDays })}
                </span>
                <span className="font-pp-display text-pp-headline-lg text-pp-on-surface font-bold tabular-nums block">
                  ${window.collectedRevenue.toLocaleString(locale)}
                </span>
              </div>
            ))}
          </div>
        )}
      </PpCard>

      {/* 4. Campaign Payback Breakdown Section */}
      {paybackPackInstalled && (
        <PpCard
          title={t('campaignPaybackHeading')}
          subtitle={t('campaignPaybackDescription')}
          icon={Activity}
          iconAccent="mint"
          flush={Boolean(campaignPaybackOutcome && campaignPaybackOutcome.ok && campaignPaybackOutcome.rows.length > 0)}
        >
          {!campaignPaybackOutcome || !campaignPaybackOutcome.ok ? (
            <PpEmptyState
              icon={Activity}
              title={t('campaignPaybackHeading')}
              description={t('campaignPaybackUnavailable')}
            />
          ) : campaignPaybackOutcome.rows.length === 0 ? (
            <PpEmptyState
              icon={Activity}
              title={t('campaignPaybackHeading')}
              description={t('campaignPaybackEmpty')}
            />
          ) : (
            <PpTable>
              <thead>
                <tr>
                  <th>{t('columnCampaign')}</th>
                  <th>{t('columnCollectedRevenue40d')}</th>
                  <th>{t('columnRoi40d')}</th>
                </tr>
              </thead>
              <tbody>
                {campaignPaybackOutcome.rows.map((row) => (
                  <tr key={row.campaignId}>
                    <td className="font-semibold text-pp-on-surface">{row.campaignId}</td>
                    <td className="tabular-nums font-mono text-pp-on-surface">
                      ${row.collectedRevenue40d.toLocaleString(locale)}
                    </td>
                    <td className="tabular-nums font-mono">
                      {row.roi40d === null ? (
                        <span className="text-pp-outline">{t('campaignPaybackNoData')}</span>
                      ) : (
                        <PpPill accent={row.roi40d >= 1 ? 'mint' : 'amber'}>
                          {row.roi40d.toLocaleString(locale, { maximumFractionDigits: 2 })}x
                        </PpPill>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </PpTable>
          )}
        </PpCard>
      )}

      {/* 5. Quality Calibration Section */}
      {paybackPackInstalled && (
        <PpCard
          title={t('calibrationHeading')}
          subtitle={t('calibrationDescription')}
          icon={ShieldCheck}
          iconAccent="sky"
          flush={Boolean(calibrationOutcome && calibrationOutcome.ok && calibrationOutcome.tiers.length > 0)}
        >
          {!calibrationOutcome || !calibrationOutcome.ok ? (
            <PpEmptyState
              icon={ShieldCheck}
              title={t('calibrationHeading')}
              description={t('calibrationUnavailable')}
            />
          ) : (
            <PpTable>
              <thead>
                <tr>
                  <th>{t('columnQualityTier')}</th>
                  <th>{t('columnSignups')}</th>
                  <th>{t('columnPayingRate')}</th>
                  <th>{t('columnAvgRevenue40d')}</th>
                </tr>
              </thead>
              <tbody>
                {calibrationOutcome.tiers.map((tier) => (
                  <tr key={tier.qualityTier}>
                    <td className="font-semibold text-pp-on-surface">
                      {t(signupQualityScoreTierLabelKey(tier.qualityTier))}
                    </td>
                    <td className="tabular-nums font-mono">{tier.signups.toLocaleString(locale)}</td>
                    <td className="tabular-nums font-mono">
                      {tier.payingRate === null ? (
                        <span className="text-pp-outline">{t('calibrationNoData')}</span>
                      ) : (
                        `${(tier.payingRate * 100).toFixed(1)}%`
                      )}
                    </td>
                    <td className="tabular-nums font-mono">
                      {tier.avgCollectedRevenue40d === null ? (
                        <span className="text-pp-outline">{t('calibrationNoData')}</span>
                      ) : (
                        `$${tier.avgCollectedRevenue40d.toLocaleString(locale, { maximumFractionDigits: 2 })}`
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </PpTable>
          )}
        </PpCard>
      )}

      {/* 5.5. Creative Wear-Out & Fatigue Radar Section (KAN-305, Stitch 6bf1b35b) */}
      <PpCard
        title={t('fatigueRadarHeading')}
        subtitle={t('fatigueRadarDescription')}
        icon={Radar}
        iconAccent="error"
        flush={creativeFatigue.hasData && creativeFatigue.creatives.length > 0}
      >
        {!creativeFatigue.hasData || creativeFatigue.creatives.length === 0 ? (
          <PpEmptyState
            icon={Radar}
            title={t('fatigueRadarEmptyTitle')}
            description={t('fatigueRadarEmptyDescription')}
          />
        ) : (
          <div className="flex flex-col">
            {/* Fatigue KPI Strip */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 p-4 sm:p-5 bg-pp-surface-container-low border-b border-pp-outline-variant/30">
              <div className="flex flex-col gap-1">
                <span className="text-xs font-medium text-pp-outline">{t('kpiSaturatedCreatives')}</span>
                <div className="flex items-baseline gap-1.5">
                  <span className="text-xl font-bold font-mono text-pp-error">
                    {creativeFatigue.fatiguedCount}
                  </span>
                  <span className="text-xs text-pp-outline font-mono">
                    / {creativeFatigue.totalCreatives}
                  </span>
                </div>
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-xs font-medium text-pp-outline">{t('kpiWearingOutCreatives')}</span>
                <span className="text-xl font-bold font-mono text-pp-amber">
                  {creativeFatigue.wearingOutCount}
                </span>
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-xs font-medium text-pp-outline">{t('kpiAvgDecayRate')}</span>
                <span className="text-xl font-bold font-mono text-pp-error">
                  {creativeFatigue.avgDecayRatePct > 0 ? `-${creativeFatigue.avgDecayRatePct}%` : '0.0%'}
                </span>
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-xs font-medium text-pp-outline">{t('kpiBudgetAtRisk')}</span>
                <span className="text-xl font-bold font-mono text-pp-on-surface">
                  ${creativeFatigue.budgetAtRisk.toLocaleString(locale, { maximumFractionDigits: 0 })}
                </span>
              </div>
            </div>

            {/* Creatives Fatigue Table */}
            <PpTable>
              <thead>
                <tr>
                  <th>{t('columnCreative')}</th>
                  <th>{t('columnChannel')}</th>
                  <th>{t('columnFrequency')}</th>
                  <th>{t('columnCtrComparison')}</th>
                  <th>{t('columnDecayRate')}</th>
                  <th>{t('columnFatigueLevel')}</th>
                  <th>{t('columnRecommendation')}</th>
                </tr>
              </thead>
              <tbody>
                {creativeFatigue.creatives.map((c) => (
                  <tr key={c.id}>
                    <td className="font-semibold text-pp-on-surface">
                      <div className="flex flex-col">
                        <span>{c.creativeName}</span>
                        <span className="text-xs font-mono text-pp-outline">{c.creativeId}</span>
                      </div>
                    </td>
                    <td>
                      <span className="uppercase text-xs font-mono font-semibold text-pp-secondary">
                        {c.channel}
                      </span>
                    </td>
                    <td className="tabular-nums font-mono font-medium">
                      {c.frequency.toFixed(2)}x
                    </td>
                    <td className="tabular-nums font-mono text-xs">
                      <span className="font-semibold text-pp-on-surface">{c.currentCtrPct.toFixed(2)}%</span>
                      <span className="text-pp-outline"> / {c.baselineCtrPct.toFixed(2)}%</span>
                    </td>
                    <td className="tabular-nums font-mono">
                      <span
                        className={
                          c.decayPct > 0
                            ? 'text-pp-error font-semibold'
                            : 'text-pp-mint font-semibold'
                        }
                      >
                        {c.decayPct > 0 ? `-${c.decayPct.toFixed(1)}%` : `+${Math.abs(c.decayPct).toFixed(1)}%`}
                      </span>
                    </td>
                    <td>
                      <PpPill accent={creativeFatiguePillAccent(c.fatigueLevel)} dot>
                        {t(creativeFatigueLevelLabelKey(c.fatigueLevel))}
                      </PpPill>
                    </td>
                    <td>
                      <PpPill accent={creativeSwapActionPillAccent(c.recommendedAction)}>
                        {t(creativeSwapActionLabelKey(c.recommendedAction))}
                      </PpPill>
                    </td>
                  </tr>
                ))}
              </tbody>
            </PpTable>
          </div>
        )}
      </PpCard>

      {/* 6. Spend Targets & Inline Target Governance Section */}
      <PpCard
        title={t('spendTargetsHeading')}
        subtitle={t('spendTargetsDescription', { days: CAMPAIGN_SPEND_TRAILING_WINDOW_DAYS })}
        icon={Target}
        iconAccent="amber"
        flush={Boolean(spendOutcome.ok && spendOutcome.rows.length > 0)}
      >
        {!spendOutcome.ok ? (
          <PpEmptyState
            icon={Target}
            title={t('spendTargetsHeading')}
            description={t('spendTargetsUnavailable')}
          />
        ) : spendOutcome.rows.length === 0 ? (
          <PpEmptyState
            icon={Target}
            title={t('spendTargetsHeading')}
            description={t('spendTargetsEmpty')}
          />
        ) : (
          <PpTable>
            <thead>
              <tr>
                <th>{t('columnCampaign')}</th>
                <th>{t('columnActualSpend')}</th>
                <th>{t('columnTarget')}</th>
                <th>{t('columnStatus')}</th>
              </tr>
            </thead>
            <tbody>
              {spendOutcome.rows.map((row) => (
                <tr key={row.campaignId}>
                  <td className="font-semibold text-pp-on-surface">{row.campaignId}</td>
                  <td className="tabular-nums font-mono">${row.actualSpend.toLocaleString(locale)}</td>
                  <td>
                    <CampaignTargetInput
                      orgId={orgId}
                      projectId={projectId}
                      campaignId={row.campaignId}
                      monthlyBudget={row.monthlyBudget}
                    />
                  </td>
                  <td>
                    <PpPill
                      accent={
                        row.status === 'over_target'
                          ? 'error'
                          : row.status === 'on_target'
                            ? 'mint'
                            : 'neutral'
                      }
                      dot
                    >
                      {t(campaignSpendStatusLabelKey(row.status))}
                    </PpPill>
                  </td>
                </tr>
              ))}
            </tbody>
          </PpTable>
        )}
      </PpCard>
    </PpPage>
  );
}
