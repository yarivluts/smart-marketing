import { notFound, redirect } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { BellRing, Building2, DatabaseZap, Factory, Globe2, PieChart, Scale, Users } from 'lucide-react';
import { can } from '@growthos/shared';
import { FIRMOGRAPHIC_PACK_PLUGIN_ID, type FirmographicBreakdownDimension } from '@growthos/firebase-orm-models';
import { getServerSession } from '@/lib/auth/get-server-session';
import { resolveOrgSessionContext } from '@/lib/orgs/session-context';
import { findActiveMembership } from '@/lib/orgs/access';
import {
  builtinMetricPacks,
  getFirmographicCompositionDimensionBreakdownForProject,
  getFirmographicIndustryBreakdownForProject,
  listFirmographicCompositionAlertsForProject,
  listFirmographicRecordsForProject,
  listOrgProjects,
  listPluginInstallsForProject,
} from '@/lib/orgs/queries';
import { hasActiveInstall, toPluginInstallView } from '@/lib/orgs/plugin-view';
import { firmographicIndustryLabelKey, toFirmographicCompositionRows, toFirmographicCompositionShares } from '@/lib/orgs/firmographic-view';
import { PackSetupLanding } from '@/components/orgs/pack-setup-landing';
import { CheckFirmographicCompositionAlertsButton } from '@/components/orgs/check-firmographic-composition-alerts-button';
import { StatCard } from '@/components/ui/stat-card';
import { BarList, ChartCard, ComparisonBars, DonutChart, EmptyState, PageHero, TrendChart } from '@/components/viz';
import type { LucideIcon } from 'lucide-react';

type PageProps = Readonly<{
  params: Promise<{ locale: string; orgId: string; projectId: string }>;
}>;

export async function generateMetadata({ params }: PageProps) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'Firmographics' });
  return { title: t('metaTitle') };
}

const DIMENSIONS: readonly { key: FirmographicBreakdownDimension; headingKey: string; emptyKey: string; icon: LucideIcon }[] = [
  { key: 'industry', headingKey: 'byIndustryHeading', emptyKey: 'byIndustryEmpty', icon: Factory },
  { key: 'employee_count_range', headingKey: 'byEmployeeCountHeading', emptyKey: 'byEmployeeCountEmpty', icon: Users },
  { key: 'region', headingKey: 'byRegionHeading', emptyKey: 'byRegionEmpty', icon: Globe2 },
];

/** Donut slices beyond this many are folded into the legend's tail by share, so the ring stays readable. */
const MAX_INDUSTRY_SLICES = 8;

/**
 * A project's firmographic composition dashboard (KAN-87, plan `14 §Gap
 * 11`) — mirrors the Churn Reasons page's own shape exactly (same gating,
 * same install-card-until-installed posture, KAN-84). The industry
 * breakdown is computed fresh from bounded Firestore reads (no warehouse
 * needed, same posture `getCancellationReasonCodeBreakdownForProject`
 * takes); the "# vs $" composition-by-dimension sections and the
 * composition-shift alert list are the warehouse-backed halves, degrading
 * per-dimension (not blanking the whole page) the same way a board tile
 * degrades when the warehouse isn't configured yet (`queryBoardTile`,
 * KAN-60).
 */
export default async function FirmographicsPage({ params }: PageProps): Promise<React.ReactElement> {
  const { locale, orgId, projectId } = await params;
  setRequestLocale(locale);

  const session = await getServerSession();
  if (!session) {
    redirect(`/${locale}/login?from=%2Forgs%2F${orgId}%2Fprojects%2F${projectId}%2Ffirmographics`);
  }

  const { user, memberships, bindings } = await resolveOrgSessionContext(session);
  const membership = findActiveMembership(memberships, orgId);
  if (!membership || !can(bindings, { type: 'user', id: user.id }, 'ingest.write', { orgId, projectId })) {
    notFound();
  }

  const [projects, installs] = await Promise.all([listOrgProjects(orgId), listPluginInstallsForProject(orgId, projectId)]);
  const project = projects.find((candidate) => candidate.id === projectId);
  if (!project) {
    notFound();
  }

  const installViews = installs.map(toPluginInstallView);
  const packInstalled = hasActiveInstall(installViews, FIRMOGRAPHIC_PACK_PLUGIN_ID);

  const t = await getTranslations('Firmographics');

  if (!packInstalled) {
    const installablePacks = builtinMetricPacks().filter((pack) => pack.pluginId === FIRMOGRAPHIC_PACK_PLUGIN_ID);
    return (
      <PackSetupLanding
        orgId={orgId}
        projectId={projectId}
        icon={Building2}
        eyebrow={t('eyebrow')}
        title={t('title', { projectName: project.name })}
        intro={t('setupIntro')}
        featuresTitle={t('setupFeaturesTitle')}
        installTitle={t('setupInstallTitle')}
        packs={installablePacks}
        features={[
          { key: 'industry', icon: Factory, title: t('setupFeatureIndustryTitle'), description: t('setupFeatureIndustryDescription') },
          { key: 'composition', icon: Scale, title: t('setupFeatureCompositionTitle'), description: t('setupFeatureCompositionDescription') },
          { key: 'alerts', icon: BellRing, title: t('setupFeatureAlertsTitle'), description: t('setupFeatureAlertsDescription') },
        ]}
      />
    );
  }

  const firmographicRecords = await listFirmographicRecordsForProject(orgId, projectId);
  const [industryBreakdown, dimensionOutcomes, alerts] = await Promise.all([
    getFirmographicIndustryBreakdownForProject(orgId, projectId, { precomputedRecords: firmographicRecords }),
    Promise.all(DIMENSIONS.map((dimension) => getFirmographicCompositionDimensionBreakdownForProject(orgId, projectId, dimension.key))),
    listFirmographicCompositionAlertsForProject(orgId, projectId),
  ]);

  const activeAlerts = alerts.filter((alert) => alert.status === 'active');
  const numberFormat = new Intl.NumberFormat(locale);
  const totalProfiles = industryBreakdown.reduce((sum, entry) => sum + entry.count, 0);
  const topIndustry = industryBreakdown[0] ?? null;
  const industryLabel = (industry: string) => t(firmographicIndustryLabelKey(industry));
  const valueLabel = (dimension: FirmographicBreakdownDimension, value: string) =>
    !value ? t('dimensionValueUnknown') : dimension === 'industry' ? industryLabel(value) : value;

  const compositionCard = (dimension: (typeof DIMENSIONS)[number], index: number, className?: string) => {
    const outcome = dimensionOutcomes[index];
    const shares = outcome.ok ? toFirmographicCompositionShares(toFirmographicCompositionRows(outcome.rows, dimension.key)) : [];
    return (
      <ChartCard key={dimension.key} title={t(dimension.headingKey)} description={t('compositionDescription')} icon={dimension.icon} className={className} fill>
        {shares.length === 0 ? (
          <EmptyState icon={DatabaseZap} title={t(dimension.emptyKey)} compact />
        ) : (
          <div className="flex flex-col gap-4">
            <TrendChart
              label={t(dimension.headingKey)}
              xKey="segment"
              kind="bar"
              valueFormat="percent"
              height={240}
              data={shares.slice(0, MAX_INDUSTRY_SLICES).map((row) => ({ segment: valueLabel(dimension.key, row.value), profiles: row.countShare, mrr: row.mrrShare }))}
              series={[
                { key: 'profiles', label: t('compositionShareProfiles') },
                { key: 'mrr', label: t('compositionShareMrr'), color: 'hsl(var(--success))' },
              ]}
            />
            <BarList
              items={shares.map((row) => ({
                key: row.value || '__unknown__',
                label: valueLabel(dimension.key, row.value),
                sublabel: t('compositionMrr', { amount: Math.round(row.mrr) }),
                value: row.count,
              }))}
              valueFormatter={(count) => t('compositionCount', { count })}
              maxItems={5}
              moreLabel={(hidden) => t('dimensionMore', { count: hidden })}
            />
          </div>
        )}
      </ChartCard>
    );
  };

  return (
    <div className="container mx-auto flex max-w-6xl flex-col gap-6 py-10">
      <PageHero icon={Building2} eyebrow={t('eyebrow')} title={t('title', { projectName: project.name })} description={t('description')}>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard title={t('kpiProfiles')} value={totalProfiles > 0 ? numberFormat.format(totalProfiles) : t('kpiNoValue')} icon={Building2} />
          <StatCard title={t('kpiIndustries')} value={industryBreakdown.length > 0 ? numberFormat.format(industryBreakdown.length) : t('kpiNoValue')} icon={Factory} />
          <StatCard
            title={t('kpiTopIndustry')}
            value={topIndustry ? industryLabel(topIndustry.industry) : t('kpiNoValue')}
            subtext={topIndustry ? t('kpiShareOfProfiles', { percent: Math.round((topIndustry.count / totalProfiles) * 100) }) : undefined}
            icon={PieChart}
          />
          <StatCard title={t('kpiActiveAlerts')} value={numberFormat.format(activeAlerts.length)} icon={BellRing} />
        </div>
      </PageHero>

      <div className="grid gap-6 lg:grid-cols-5">
        <ChartCard title={t('industryHeading')} description={t('industryDescription')} icon={PieChart} className="lg:col-span-2" fill>
          {industryBreakdown.length === 0 ? (
            <EmptyState icon={Building2} title={t('industryEmpty')} description={t('industryEmptyDetail')} compact />
          ) : (
            <DonutChart
              label={t('industryHeading')}
              layout="stacked"
              centerValue={numberFormat.format(totalProfiles)}
              centerLabel={t('industryCenterLabel')}
              data={industryBreakdown.map((entry) => ({ label: industryLabel(entry.industry), value: entry.count }))}
            />
          )}
        </ChartCard>
        {compositionCard(DIMENSIONS[0], 0, 'lg:col-span-3')}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">{DIMENSIONS.slice(1).map((dimension, offset) => compositionCard(dimension, offset + 1))}</div>

      <ChartCard
        title={t('alertsHeading')}
        description={t('alertsDescription')}
        icon={BellRing}
        actions={<CheckFirmographicCompositionAlertsButton orgId={orgId} projectId={projectId} />}
      >
        {activeAlerts.length === 0 ? (
          <EmptyState icon={BellRing} title={t('alertsEmpty')} compact />
        ) : (
          <ul className="grid gap-3 md:grid-cols-2">
            {activeAlerts.map((alert) => {
              const baseline = Math.round(alert.baseline_share * 100);
              const current = Math.round(alert.current_share * 100);
              return (
                <li key={alert.id} className="flex flex-col gap-2 rounded-xl border border-border px-4 py-3 text-sm">
                  <span className="font-medium text-foreground">{industryLabel(alert.industry)}</span>
                  <ComparisonBars
                    label={t('alertShift', { baseline, current })}
                    max={100}
                    bars={[
                      { key: 'baseline', label: t('alertBaselineLabel'), value: baseline, display: t('kpiPercent', { percent: baseline }), color: 'hsl(var(--muted-foreground) / 0.45)' },
                      { key: 'current', label: t('alertCurrentLabel'), value: current, display: t('kpiPercent', { percent: current }), color: 'hsl(var(--warning))' },
                    ]}
                  />
                  <span className="text-xs text-muted-foreground">{t('alertShift', { baseline, current })}</span>
                </li>
              );
            })}
          </ul>
        )}
      </ChartCard>
    </div>
  );
}
