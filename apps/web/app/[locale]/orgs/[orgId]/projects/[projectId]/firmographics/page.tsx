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
    notFound();
  }

  const installViews = installs.map(toPluginInstallView);
  const packInstalled = hasActiveInstall(installViews, FIRMOGRAPHIC_PACK_PLUGIN_ID);

  const t = await getTranslations('Firmographics');

  if (!packInstalled) {
    const installablePacks = builtinMetricPacks().filter((pack) => pack.pluginId === FIRMOGRAPHIC_PACK_PLUGIN_ID);
    return (
      <main className="container mx-auto flex max-w-3xl flex-col gap-8 py-16">
        <h1 className="text-3xl font-bold tracking-tight">{t('title', { projectName: project.name })}</h1>
        <p className="text-sm text-muted-foreground">{t('setupIntro')}</p>
        <InstallBuiltinPackSection orgId={orgId} projectId={projectId} packs={installablePacks} />
      </main>
    );
  }

  const firmographicRecords = await listFirmographicRecordsForProject(orgId, projectId);
  const [industryBreakdown, dimensionOutcomes, alerts] = await Promise.all([
    getFirmographicIndustryBreakdownForProject(orgId, projectId, { precomputedRecords: firmographicRecords }),
    Promise.all(DIMENSIONS.map((dimension) => getFirmographicCompositionDimensionBreakdownForProject(orgId, projectId, dimension.key))),
    listFirmographicCompositionAlertsForProject(orgId, projectId),
  ]);

  const activeAlerts = alerts.filter((alert) => alert.status === 'active');

  return (
    <main className="container mx-auto flex max-w-3xl flex-col gap-8 py-16">
      <h1 className="text-3xl font-bold tracking-tight">{t('title', { projectName: project.name })}</h1>
      <p className="text-sm text-muted-foreground">{t('description')}</p>

      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-semibold tracking-tight">{t('industryHeading')}</h2>
        {industryBreakdown.length === 0 ? (
          <p className="text-muted-foreground">{t('industryEmpty')}</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {industryBreakdown.map((entry) => (
              <li key={entry.industry} className="flex items-center justify-between gap-3 rounded-md border border-input px-3 py-2 text-sm">
                <span>{t(firmographicIndustryLabelKey(entry.industry))}</span>
                <span className="text-muted-foreground">{t('industryCount', { count: entry.count })}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {DIMENSIONS.map((dimension, index) => {
        const outcome = dimensionOutcomes[index];
        return (
          <section key={dimension.key} className="flex flex-col gap-3">
            <h2 className="text-xl font-semibold tracking-tight">{t(dimension.headingKey)}</h2>
            {!outcome.ok ? (
              <p className="text-muted-foreground">{t(dimension.emptyKey)}</p>
            ) : outcome.rows.length === 0 ? (
              <p className="text-muted-foreground">{t(dimension.emptyKey)}</p>
            ) : (
              <ul className="flex flex-col gap-1">
                {toFirmographicCompositionRows(outcome.rows, dimension.key).map((row) => (
                  <li key={row.value} className="flex items-center justify-between gap-3 rounded-md border border-input px-3 py-2 text-sm">
                    <span>{row.value || t('dimensionValueUnknown')}</span>
                    <span className="flex gap-3 text-muted-foreground">
                      <span>{t('compositionCount', { count: row.count })}</span>
                      <span>{t('compositionMrr', { amount: Math.round(row.mrr) })}</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        );
      })}

      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-xl font-semibold tracking-tight">{t('alertsHeading')}</h2>
          <CheckFirmographicCompositionAlertsButton orgId={orgId} projectId={projectId} />
        </div>
        {activeAlerts.length === 0 ? (
          <p className="text-muted-foreground">{t('alertsEmpty')}</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {activeAlerts.map((alert) => (
              <li key={alert.id} className="flex items-center justify-between gap-3 rounded-md border border-input px-3 py-2 text-sm">
                <span>{t(firmographicIndustryLabelKey(alert.industry))}</span>
                <span className="text-muted-foreground">
                  {t('alertShift', { baseline: Math.round(alert.baseline_share * 100), current: Math.round(alert.current_share * 100) })}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
