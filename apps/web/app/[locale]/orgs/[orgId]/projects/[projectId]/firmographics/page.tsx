import { notFound, redirect } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
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
import { firmographicIndustryLabelKey, toFirmographicCompositionRows } from '@/lib/orgs/firmographic-view';
import { InstallBuiltinPackSection } from '@/components/orgs/install-builtin-pack-section';
import { CheckFirmographicCompositionAlertsButton } from '@/components/orgs/check-firmographic-composition-alerts-button';
import { PpPage, PpPageHeader, PpCard, PpKpiCard, PpKpiGrid, PpEmptyState, PpPill, PpTable } from '@/components/pastel/primitives';
import { Building2, Layers, AlertTriangle, Globe, Users } from 'lucide-react';

type PageProps = Readonly<{
  params: Promise<{ locale: string; orgId: string; projectId: string }>;
}>;

export async function generateMetadata({ params }: PageProps) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'Firmographics' });
  return { title: t('metaTitle') };
}

const DIMENSIONS: readonly { key: FirmographicBreakdownDimension; headingKey: string; emptyKey: string }[] = [
  { key: 'industry', headingKey: 'byIndustryHeading', emptyKey: 'byIndustryEmpty' },
  { key: 'employee_count_range', headingKey: 'byEmployeeCountHeading', emptyKey: 'byEmployeeCountEmpty' },
  { key: 'region', headingKey: 'byRegionHeading', emptyKey: 'byRegionEmpty' },
];

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
  if (!membership || !can(bindings, { type: 'user', id: user.id }, 'ingest.write', { orgId })) {
    notFound();
  }

  const [projects, installs] = await Promise.all([listOrgProjects(orgId), listPluginInstallsForProject(orgId, projectId)]);
  const project = projects.find((candidate) => candidate.id === projectId);
  if (!project) {
    if (projects.length > 0) {
      redirect(`/${locale}/orgs/${orgId}/projects/${projects[0].id}/firmographics`);
    }
    redirect(`/${locale}/orgs/${orgId}`);
  }

  const installViews = installs.map(toPluginInstallView);
  const packInstalled = hasActiveInstall(installViews, FIRMOGRAPHIC_PACK_PLUGIN_ID);

  const t = await getTranslations('Firmographics');

  if (!packInstalled) {
    const installablePacks = builtinMetricPacks().filter((pack) => pack.pluginId === FIRMOGRAPHIC_PACK_PLUGIN_ID);
    return (
      <PpPage>
        <PpPageHeader
          eyebrow="B2B INTELLIGENCE"
          meta={project.name}
          title={t('title', { projectName: project.name })}
          description={t('setupIntro')}
        />
        <PpCard>
          <InstallBuiltinPackSection orgId={orgId} projectId={projectId} packs={installablePacks} />
        </PpCard>
      </PpPage>
    );
  }

  const firmographicRecords = await listFirmographicRecordsForProject(orgId, projectId);
  const [industryBreakdown, dimensionOutcomes, alerts] = await Promise.all([
    getFirmographicIndustryBreakdownForProject(orgId, projectId, { precomputedRecords: firmographicRecords }),
    Promise.all(DIMENSIONS.map((dimension) => getFirmographicCompositionDimensionBreakdownForProject(orgId, projectId, dimension.key))),
    listFirmographicCompositionAlertsForProject(orgId, projectId),
  ]);

  const activeAlerts = alerts.filter((alert) => alert.status === 'active');
  const totalCount = industryBreakdown.reduce((sum, e) => sum + e.count, 0);

  return (
    <PpPage>
      <PpPageHeader
        eyebrow="B2B INTELLIGENCE"
        meta={firmographicRecords.length > 0 ? `${firmographicRecords.length} profiles` : undefined}
        title={t('title', { projectName: project.name })}
        description={t('description')}
      />

      <PpKpiGrid>
        <PpKpiCard
          label={t('totalAccountsLabel')}
          value={firmographicRecords.length > 0 ? firmographicRecords.length : '—'}
          accent="primary"
          footer={industryBreakdown.length > 0 ? `${industryBreakdown.length} industries` : undefined}
        />
        <PpKpiCard
          label={t('activeAlertsLabel')}
          value={activeAlerts.length}
          badge={activeAlerts.length > 0 ? 'ALERT' : 'HEALTHY'}
          badgeAccent={activeAlerts.length > 0 ? 'error' : 'mint'}
          accent={activeAlerts.length > 0 ? 'error' : 'mint'}
          footer={activeAlerts.length === 0 ? t('alertsEmpty') : `${activeAlerts.length} shifts detected`}
        />
        <PpKpiCard
          label={t('industryHeading')}
          value={industryBreakdown[0] ? t(firmographicIndustryLabelKey(industryBreakdown[0].industry)) : '—'}
          accent="sky"
          footer={industryBreakdown[0] ? t('industryCount', { count: industryBreakdown[0].count }) : undefined}
        />
        <PpKpiCard
          label={t('byRegionHeading')}
          value={dimensionOutcomes[2]?.ok && dimensionOutcomes[2].rows.length > 0 ? dimensionOutcomes[2].rows.length : '—'}
          accent="amber"
          footer="Active territories"
        />
      </PpKpiGrid>

      <PpCard
        icon={Building2}
        iconAccent="primary"
        title={t('industryHeading')}
        subtitle={totalCount > 0 ? `${totalCount} classified accounts` : undefined}
      >
        {industryBreakdown.length === 0 ? (
          <PpEmptyState
            icon={Building2}
            title={t('industryHeading')}
            description={t('industryEmpty')}
          />
        ) : (
          <div className="space-y-3">
            {industryBreakdown.map((entry) => {
              const pct = totalCount > 0 ? Math.round((entry.count / totalCount) * 100) : 0;
              return (
                <div key={entry.industry} className="space-y-1.5">
                  <div className="flex items-center justify-between text-pp-body-sm">
                    <span className="font-semibold text-pp-on-surface">{t(firmographicIndustryLabelKey(entry.industry))}</span>
                    <span className="text-pp-on-surface-variant">
                      {t('industryCount', { count: entry.count })}{' '}
                      <span className="font-bold text-pp-primary ms-1">({pct}%)</span>
                    </span>
                  </div>
                  <div className="h-2.5 w-full overflow-hidden rounded-full bg-pp-surface-container">
                    <div
                      className="h-full rounded-full bg-pp-primary transition-all duration-300"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </PpCard>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-pp-lg">
        {DIMENSIONS.map((dimension, index) => {
          const outcome = dimensionOutcomes[index];
          const rows = outcome.ok ? toFirmographicCompositionRows(outcome.rows, dimension.key) : [];
          return (
            <PpCard
              key={dimension.key}
              icon={dimension.key === 'industry' ? Building2 : dimension.key === 'employee_count_range' ? Users : Globe}
              iconAccent={dimension.key === 'industry' ? 'primary' : dimension.key === 'employee_count_range' ? 'amber' : 'sky'}
              title={t(dimension.headingKey)}
              flush={outcome.ok && rows.length > 0}
            >
              {!outcome.ok || rows.length === 0 ? (
                <PpEmptyState
                  icon={Layers}
                  title={t(dimension.headingKey)}
                  description={t(dimension.emptyKey)}
                />
              ) : (
                <PpTable>
                  <thead>
                    <tr>
                      <th>Segment</th>
                      <th className="text-end">Accounts</th>
                      <th className="text-end">MRR</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => (
                      <tr key={row.value}>
                        <td className="font-medium text-pp-on-surface">{row.value || t('dimensionValueUnknown')}</td>
                        <td className="text-end">{t('compositionCount', { count: row.count })}</td>
                        <td className="text-end font-semibold text-pp-primary">
                          {t('compositionMrr', { amount: Math.round(row.mrr) })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </PpTable>
              )}
            </PpCard>
          );
        })}
      </div>

      <PpCard
        icon={AlertTriangle}
        iconAccent="amber"
        title={t('alertsHeading')}
        action={<CheckFirmographicCompositionAlertsButton orgId={orgId} projectId={projectId} />}
      >
        {activeAlerts.length === 0 ? (
          <PpEmptyState
            icon={AlertTriangle}
            title={t('alertsHeading')}
            description={t('alertsEmpty')}
          />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-pp-md">
            {activeAlerts.map((alert) => (
              <div
                key={alert.id}
                className="flex items-center justify-between gap-3 rounded-2xl border border-amber-200 bg-amber-50/50 p-pp-md dark:border-amber-900/40 dark:bg-amber-950/20"
              >
                <div className="min-w-0">
                  <div className="font-pp-display text-pp-headline-sm font-bold text-pp-on-surface">
                    {t(firmographicIndustryLabelKey(alert.industry))}
                  </div>
                  <div className="text-pp-body-sm text-pp-on-surface-variant mt-0.5">
                    {t('alertShift', {
                      baseline: Math.round(alert.baseline_share * 100),
                      current: Math.round(alert.current_share * 100),
                    })}
                  </div>
                </div>
                <PpPill accent="amber" dot>Shift Active</PpPill>
              </div>
            ))}
          </div>
        )}
      </PpCard>
    </PpPage>
  );
}
