import { notFound, redirect } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { can } from '@growthos/shared';
import { EXPERIMENT_PACK_PLUGIN_ID } from '@growthos/firebase-orm-models';
import { getServerSession } from '@/lib/auth/get-server-session';
import { resolveOrgSessionContext } from '@/lib/orgs/session-context';
import { findActiveMembership } from '@/lib/orgs/access';
import { builtinMetricPacks, getExperimentResultsForProject, listOrgProjects, listPluginInstallsForProject } from '@/lib/orgs/queries';
import { hasActiveInstall, toPluginInstallView } from '@/lib/orgs/plugin-view';
import { experimentVariantBadge, experimentVariantBadgeLabelKey } from '@/lib/orgs/experiment-view';
import { InstallBuiltinPackSection } from '@/components/orgs/install-builtin-pack-section';
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
import { FlaskConical, Sparkles, TrendingUp, CheckCircle2, AlertCircle } from 'lucide-react';

type PageProps = Readonly<{
  params: Promise<{ locale: string; orgId: string; projectId: string }>;
}>;

export async function generateMetadata({ params }: PageProps) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'Experiments' });
  return { title: t('metaTitle') };
}

/**
 * A project's A/B experiment results (KAN-89):
 * Variant / exposures / conversions / conversion rate / uplift vs. control / significance,
 * backed by a two-proportion z-test.
 *
 * Converted to Stitch Pastel Pulse design (desktop ac05dcf4, mobile 6a9a05cc),
 * folding all real experiment tables without fake mock metrics.
 */
export default async function ExperimentsPage({ params }: PageProps): Promise<React.ReactElement> {
  const { locale, orgId, projectId } = await params;
  setRequestLocale(locale);

  const session = await getServerSession();
  if (!session) {
    redirect(`/${locale}/login?from=%2Forgs%2F${orgId}%2Fprojects%2F${projectId}%2Fexperiments`);
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
      redirect(`/${locale}/orgs/${orgId}/projects/${projects[0].id}/experiments`);
    }
    redirect(`/${locale}/orgs/${orgId}`);
  }

  const installViews = installs.map(toPluginInstallView);
  const packInstalled = hasActiveInstall(installViews, EXPERIMENT_PACK_PLUGIN_ID);

  const t = await getTranslations('Experiments');

  if (!packInstalled) {
    const installablePacks = builtinMetricPacks().filter((pack) => pack.pluginId === EXPERIMENT_PACK_PLUGIN_ID);
    return (
      <PpPage>
        <PpPageHeader
          eyebrow="EXPERIMENT PACK REQUIRED"
          title={t('title', { projectName: project.name })}
          description={t('setupIntro')}
        />
        <PpCard title="Install Metric Pack" subtitle="Activate in-app A/B testing and statistical significance engine">
          <InstallBuiltinPackSection orgId={orgId} projectId={projectId} packs={installablePacks} />
        </PpCard>
      </PpPage>
    );
  }

  const outcome = await getExperimentResultsForProject(orgId, projectId);
  const isDataConnected = outcome.ok && outcome.results.length > 0;

  const totalVariants = outcome.ok ? outcome.results.reduce((sum, r) => sum + r.variants.length, 0) : 0;
  const totalExposures = outcome.ok
    ? outcome.results.reduce((sum, r) => sum + r.variants.reduce((vSum, v) => vSum + v.exposures, 0), 0)
    : 0;
  const statSigCount = outcome.ok
    ? outcome.results.reduce(
        (sum, r) => sum + r.variants.filter((v) => experimentVariantBadge(v) === 'significant').length,
        0,
      )
    : 0;

  return (
    <PpPage>
      {/* 1. Header */}
      <PpPageHeader
        eyebrow="A/B TESTING & OPTIMIZATION"
        meta={isDataConnected ? 'Statistical Engine Live' : 'Awaiting Experiment Exposures'}
        title={t('title', { projectName: project.name })}
        description={t('description')}
        actions={
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-pp-secondary-container/60 px-3 py-1.5 text-xs font-semibold text-pp-secondary">
              <span className="w-1.5 h-1.5 rounded-full bg-pp-secondary animate-pulse" />
              <span>Two-Proportion Z-Test</span>
            </span>
          </div>
        }
      />

      {/* 2. Top KPI Deck */}
      <PpKpiGrid>
        <PpKpiCard
          label="Active Experiments"
          value={outcome.ok ? outcome.results.length : 0}
          valueSuffix="tests"
          accent="primary"
          footer="Landed experiment keys"
        />
        <PpKpiCard
          label="Total Variants"
          value={totalVariants}
          valueSuffix="arms"
          badge="Variations"
          badgeAccent="mint"
          accent="mint"
          footer="Control & test variants"
        />
        <PpKpiCard
          label="Total Exposures"
          value={totalExposures.toLocaleString(locale)}
          valueSuffix="visitors"
          badge="Traffic"
          badgeAccent="sky"
          accent="sky"
          footer="Logged variation impressions"
        />
        <PpKpiCard
          label="Stat-Sig Winners"
          value={statSigCount}
          badge="p < 0.05"
          badgeAccent={statSigCount > 0 ? 'pink' : 'neutral'}
          accent="pink"
          footer="Verified conversion lift"
        />
      </PpKpiGrid>

      {/* 3. Experiments Result Tables */}
      {!outcome.ok ? (
        <PpEmptyState
          icon={AlertCircle}
          title={t('title', { projectName: project.name })}
          description={t('resultsUnavailable')}
        />
      ) : outcome.results.length === 0 ? (
        <PpEmptyState
          icon={FlaskConical}
          title={t('title', { projectName: project.name })}
          description={t('resultsEmpty')}
        />
      ) : (
        outcome.results.map((result) => (
          <PpCard
            key={result.experimentKey}
            title={result.experimentKey}
            subtitle={`${result.variants.length} test variants evaluated against control baseline`}
            icon={FlaskConical}
            iconAccent="primary"
            flush
          >
            <PpTable>
              <thead>
                <tr>
                  <th>{t('columnVariant')}</th>
                  <th>{t('columnExposures')}</th>
                  <th>{t('columnConversions')}</th>
                  <th>{t('columnConversionRate')}</th>
                  <th>{t('columnUplift')}</th>
                  <th>{t('columnResult')}</th>
                </tr>
              </thead>
              <tbody>
                {result.variants.map((variant) => {
                  const badge = experimentVariantBadge(variant);
                  return (
                    <tr key={variant.variantKey}>
                      <td className="font-semibold text-pp-on-surface">{variant.variantKey}</td>
                      <td className="tabular-nums font-mono text-pp-on-surface">
                        {variant.exposures.toLocaleString(locale)}
                      </td>
                      <td className="tabular-nums font-mono text-pp-on-surface">
                        {variant.conversions.toLocaleString(locale)}
                      </td>
                      <td className="tabular-nums font-mono">
                        {variant.conversionRate === null
                          ? t('noData')
                          : `${(variant.conversionRate * 100).toFixed(1)}%`}
                      </td>
                      <td className="tabular-nums font-mono">
                        {variant.upliftVsControlPct === null ? (
                          <span className="text-pp-outline">{t('noData')}</span>
                        ) : (
                          <span
                            className={
                              variant.upliftVsControlPct > 0
                                ? 'font-bold text-pp-secondary'
                                : variant.upliftVsControlPct < 0
                                  ? 'text-pp-error'
                                  : 'text-pp-outline'
                            }
                          >
                            {variant.upliftVsControlPct >= 0 ? '+' : ''}
                            {variant.upliftVsControlPct.toFixed(1)}%
                          </span>
                        )}
                      </td>
                      <td>
                        <PpPill
                          accent={
                            badge === 'significant'
                              ? 'mint'
                              : badge === 'control'
                                ? 'primary'
                                : 'neutral'
                          }
                          dot={badge === 'significant'}
                        >
                          {t(experimentVariantBadgeLabelKey(badge))}
                        </PpPill>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </PpTable>
          </PpCard>
        ))
      )}
    </PpPage>
  );
}
