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

type PageProps = Readonly<{
  params: Promise<{ locale: string; orgId: string; projectId: string }>;
}>;

export async function generateMetadata({ params }: PageProps) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'Experiments' });
  return { title: t('metaTitle') };
}

const BADGE_CLASS: Record<ReturnType<typeof experimentVariantBadge>, string> = {
  control: 'text-muted-foreground',
  significant: 'text-green-600 dark:text-green-500',
  not_significant: 'text-muted-foreground',
  insufficient_data: 'text-muted-foreground',
};

/**
 * A project's A/B experiment results (KAN-89, E-none/plan `14 §Gap 3`
 * slice 1): every experiment this project has landed exposure/conversion
 * data for, one table per experiment (variant / exposures / conversions /
 * conversion rate / uplift vs. control / significance), backed by a
 * two-proportion z-test (`computeExperimentResult`, `@growthos/shared`) —
 * no external experimentation tool (GrowthBook/Optimizely/VWO) integration
 * yet, same "in-app SDK path covers the buildable-today core, a real
 * third-party connector is deferred" posture KAN-82/KAN-87 establish for
 * their own gap-analysis stories. Gated on `ingest.write`, the same
 * permission the Feedback/Churn Reasons/Firmographic pages use for their
 * own pure, no-editable-state results surfaces (unlike Campaign Ops, which
 * carries an editable spend target and uses `dashboards.write` instead).
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
    notFound();
  }

  const installViews = installs.map(toPluginInstallView);
  const packInstalled = hasActiveInstall(installViews, EXPERIMENT_PACK_PLUGIN_ID);

  const t = await getTranslations('Experiments');

  if (!packInstalled) {
    const installablePacks = builtinMetricPacks().filter((pack) => pack.pluginId === EXPERIMENT_PACK_PLUGIN_ID);
    return (
      <main className="container mx-auto flex max-w-3xl flex-col gap-8 py-16">
        <h1 className="text-3xl font-bold tracking-tight">{t('title', { projectName: project.name })}</h1>
        <p className="text-sm text-muted-foreground">{t('setupIntro')}</p>
        <InstallBuiltinPackSection orgId={orgId} projectId={projectId} packs={installablePacks} />
      </main>
    );
  }

  const outcome = await getExperimentResultsForProject(orgId, projectId);

  return (
    <main className="container mx-auto flex max-w-3xl flex-col gap-8 py-16">
      <h1 className="text-3xl font-bold tracking-tight">{t('title', { projectName: project.name })}</h1>
      <p className="text-sm text-muted-foreground">{t('description')}</p>

      {!outcome.ok ? (
        <p className="text-muted-foreground">{t('resultsUnavailable')}</p>
      ) : outcome.results.length === 0 ? (
        <p className="text-muted-foreground">{t('resultsEmpty')}</p>
      ) : (
        outcome.results.map((result) => (
          <section key={result.experimentKey} className="flex flex-col gap-3">
            <h2 className="text-xl font-semibold tracking-tight">{result.experimentKey}</h2>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-input text-left text-xs text-muted-foreground">
                  <th className="py-2 pe-3 font-medium">{t('columnVariant')}</th>
                  <th className="py-2 pe-3 font-medium">{t('columnExposures')}</th>
                  <th className="py-2 pe-3 font-medium">{t('columnConversions')}</th>
                  <th className="py-2 pe-3 font-medium">{t('columnConversionRate')}</th>
                  <th className="py-2 pe-3 font-medium">{t('columnUplift')}</th>
                  <th className="py-2 font-medium">{t('columnResult')}</th>
                </tr>
              </thead>
              <tbody>
                {result.variants.map((variant) => {
                  const badge = experimentVariantBadge(variant);
                  return (
                    <tr key={variant.variantKey} className="border-b border-input last:border-0">
                      <td className="py-2 pe-3 font-medium">{variant.variantKey}</td>
                      <td className="py-2 pe-3 tabular-nums">{variant.exposures.toLocaleString(locale)}</td>
                      <td className="py-2 pe-3 tabular-nums">{variant.conversions.toLocaleString(locale)}</td>
                      <td className="py-2 pe-3 tabular-nums">{variant.conversionRate === null ? t('noData') : `${(variant.conversionRate * 100).toFixed(1)}%`}</td>
                      <td className="py-2 pe-3 tabular-nums">
                        {variant.upliftVsControlPct === null ? t('noData') : `${variant.upliftVsControlPct >= 0 ? '+' : ''}${variant.upliftVsControlPct.toFixed(1)}%`}
                      </td>
                      <td className="py-2">
                        <span className={BADGE_CLASS[badge]}>{t(experimentVariantBadgeLabelKey(badge))}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>
        ))
      )}
    </main>
  );
}
