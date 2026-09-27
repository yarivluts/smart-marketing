import { notFound, redirect } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { can } from '@growthos/shared';
import { EXPERIMENT_PACK_PLUGIN_ID } from '@growthos/firebase-orm-models';
import { DatabaseZap, FlaskConical, GitBranch, MousePointerClick, PackagePlus, Split, Trophy, Users } from 'lucide-react';
import { getServerSession } from '@/lib/auth/get-server-session';
import { resolveOrgSessionContext } from '@/lib/orgs/session-context';
import { findActiveMembership } from '@/lib/orgs/access';
import { builtinMetricPacks, getExperimentResultsForProject, listOrgProjects, listPluginInstallsForProject } from '@/lib/orgs/queries';
import { hasActiveInstall, toPluginInstallView } from '@/lib/orgs/plugin-view';
import { experimentVariantBadge, experimentVariantBadgeLabelKey, summariseExperiments, type ExperimentsSummary } from '@/lib/orgs/experiment-view';
import { InstallBuiltinPackSection } from '@/components/orgs/install-builtin-pack-section';
import { StatCard } from '@/components/ui/stat-card';
import { ChartCard, EmptyState, FlowDiagram, PageHero, STATUS_TOKENS, TrendChart, type VizStatus } from '@/components/viz';
import { cn } from '@/lib/utils';

type PageProps = Readonly<{
  params: Promise<{ locale: string; orgId: string; projectId: string }>;
}>;

export async function generateMetadata({ params }: PageProps) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'Experiments' });
  return { title: t('metaTitle') };
}

const BADGE_TONE: Record<ReturnType<typeof experimentVariantBadge>, VizStatus> = {
  control: 'idle',
  significant: 'ok',
  not_significant: 'warn',
  insufficient_data: 'idle',
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
 *
 * Each experiment also gets a conversion-rate comparison chart; the pipeline diagram shows how
 * results are produced, with real totals once data has landed and no numbers before it has.
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
  if (!membership || !can(bindings, { type: 'user', id: user.id }, 'ingest.write', { orgId, projectId })) {
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
  const integer = new Intl.NumberFormat(locale);
  const percent = new Intl.NumberFormat(locale, { style: 'percent', maximumFractionDigits: 1 });
  const signed = new Intl.NumberFormat(locale, { maximumFractionDigits: 1, signDisplay: 'exceptZero' });

  const pipeline = (summary: ExperimentsSummary | null, status: VizStatus) => (
    <ChartCard title={t('pipelineTitle')} description={t('pipelineDescription')} icon={GitBranch}>
      <FlowDiagram
        label={t('pipelineTitle')}
        height={260}
        nodes={[
          { id: 'exposure', label: t('pipelineExposures'), sublabel: t('pipelineExposuresSub'), value: summary ? integer.format(summary.exposures) : undefined, status },
          { id: 'conversion', label: t('pipelineConversions'), sublabel: t('pipelineConversionsSub'), value: summary ? integer.format(summary.conversions) : undefined, status },
          { id: 'rates', label: t('pipelineRates'), sublabel: t('pipelineRatesSub'), value: summary ? t('pipelineVariantsValue', { count: summary.variants }) : undefined, status },
          { id: 'significance', label: t('pipelineSignificance'), sublabel: t('pipelineSignificanceSub'), value: summary ? t('pipelineWinsValue', { count: summary.significantWins }) : undefined, status },
        ]}
        edges={[
          { source: 'exposure', target: 'rates', status, animated: status === 'ok' },
          { source: 'conversion', target: 'rates', status, animated: status === 'ok' },
          { source: 'rates', target: 'significance', status, animated: status === 'ok' },
        ]}
      />
    </ChartCard>
  );

  if (!packInstalled) {
    const installablePacks = builtinMetricPacks().filter((pack) => pack.pluginId === EXPERIMENT_PACK_PLUGIN_ID);
    return (
      <main className="container mx-auto flex max-w-6xl flex-col gap-6 py-10">
        <PageHero icon={FlaskConical} eyebrow={t('eyebrow')} title={t('title', { projectName: project.name })} description={t('setupIntro')} />
        {pipeline(null, 'idle')}
        <ChartCard title={t('installTitle')} description={t('installDescription')} icon={PackagePlus}>
          <InstallBuiltinPackSection orgId={orgId} projectId={projectId} packs={installablePacks} />
        </ChartCard>
      </main>
    );
  }

  const outcome = await getExperimentResultsForProject(orgId, projectId);
  const summary = outcome.ok ? summariseExperiments(outcome.results) : null;
  const hasResults = outcome.ok && outcome.results.length > 0;

  return (
    <main className="container mx-auto flex max-w-6xl flex-col gap-6 py-10">
      <PageHero icon={FlaskConical} eyebrow={t('eyebrow')} title={t('title', { projectName: project.name })} description={t('description')}>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard title={t('kpiExperiments')} value={summary ? integer.format(summary.experiments) : t('noData')} icon={FlaskConical} />
          <StatCard title={t('kpiExposures')} value={summary ? integer.format(summary.exposures) : t('noData')} icon={Users} />
          <StatCard title={t('kpiConversions')} value={summary ? integer.format(summary.conversions) : t('noData')} icon={MousePointerClick} />
          <StatCard
            title={t('kpiSignificantWins')}
            value={summary ? integer.format(summary.significantWins) : t('noData')}
            icon={Trophy}
            subtext={summary && summary.significantLosses > 0 ? t('kpiSignificantLossesSub', { count: summary.significantLosses }) : undefined}
          />
        </div>
      </PageHero>

      {pipeline(hasResults ? summary : null, !outcome.ok ? 'warn' : hasResults ? 'ok' : 'idle')}

      {!outcome.ok ? (
        <EmptyState icon={DatabaseZap} title={t('resultsUnavailable')} />
      ) : outcome.results.length === 0 ? (
        <EmptyState icon={FlaskConical} title={t('resultsEmpty')} description={t('resultsEmptyHint')} />
      ) : (
        outcome.results.map((result) => {
          const exposures = result.variants.reduce((sum, variant) => sum + variant.exposures, 0);
          return (
            <ChartCard
              key={result.experimentKey}
              title={result.experimentKey}
              description={t('experimentSummary', { control: result.controlVariantKey, variants: result.variants.length, exposures })}
              icon={Split}
            >
              <div className="flex flex-col gap-6">
                <div className="grid gap-6 lg:grid-cols-5">
                  <div className="lg:col-span-3">
                    <TrendChart
                      label={t('rateChartLabel', { experimentKey: result.experimentKey })}
                      kind="bar"
                      xKey="variant"
                      valueFormat="ratio"
                      height={220}
                      data={result.variants.map((variant) => ({ variant: variant.variantKey, rate: variant.conversionRate }))}
                      series={[{ key: 'rate', label: t('columnConversionRate') }]}
                    />
                  </div>
                  <ul className="flex flex-col gap-2 lg:col-span-2">
                    {result.variants.map((variant) => {
                      const badge = experimentVariantBadge(variant);
                      const tone = STATUS_TOKENS[BADGE_TONE[badge]];
                      const uplift = variant.upliftVsControlPct;
                      return (
                        <li key={variant.variantKey} className="flex items-center justify-between gap-3 rounded-xl border border-border bg-muted/30 px-4 py-3 text-sm">
                          <span className="flex min-w-0 flex-col gap-1">
                            <span className="truncate font-semibold text-foreground">{variant.variantKey}</span>
                            <span className={cn('inline-flex w-fit items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium', tone.soft, tone.text)}>
                              <span className={cn('h-1.5 w-1.5 rounded-full', tone.dot)} aria-hidden="true" />
                              {t(experimentVariantBadgeLabelKey(badge))}
                            </span>
                          </span>
                          <span className="flex shrink-0 flex-col items-end tabular-nums" dir="ltr">
                            <span className="text-lg font-bold text-foreground">{variant.conversionRate === null ? t('noData') : percent.format(variant.conversionRate)}</span>
                            {uplift !== null ? (
                              <span className={cn('text-xs font-semibold', uplift > 0 ? 'text-success' : uplift < 0 ? 'text-destructive' : 'text-muted-foreground')}>
                                {t('upliftShort', { uplift: signed.format(uplift) })}
                              </span>
                            ) : null}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border text-xs text-muted-foreground">
                        <th className="py-2 pe-3 text-start font-medium">{t('columnVariant')}</th>
                        <th className="py-2 pe-3 text-end font-medium">{t('columnExposures')}</th>
                        <th className="py-2 pe-3 text-end font-medium">{t('columnConversions')}</th>
                        <th className="py-2 pe-3 text-end font-medium">{t('columnConversionRate')}</th>
                        <th className="py-2 pe-3 text-end font-medium">{t('columnUplift')}</th>
                        <th className="py-2 text-start font-medium">{t('columnResult')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.variants.map((variant) => {
                        const badge = experimentVariantBadge(variant);
                        return (
                          <tr key={variant.variantKey} className="border-b border-border/60 last:border-0">
                            <td className="py-2 pe-3 font-medium">{variant.variantKey}</td>
                            <td className="py-2 pe-3 text-end tabular-nums">{integer.format(variant.exposures)}</td>
                            <td className="py-2 pe-3 text-end tabular-nums">{integer.format(variant.conversions)}</td>
                            <td className="py-2 pe-3 text-end tabular-nums">{variant.conversionRate === null ? t('noData') : `${(variant.conversionRate * 100).toFixed(1)}%`}</td>
                            <td className="py-2 pe-3 text-end tabular-nums" dir="ltr">
                              {variant.upliftVsControlPct === null ? t('noData') : `${variant.upliftVsControlPct >= 0 ? '+' : ''}${variant.upliftVsControlPct.toFixed(1)}%`}
                            </td>
                            <td className={cn('py-2', STATUS_TOKENS[BADGE_TONE[badge]].text)}>{t(experimentVariantBadgeLabelKey(badge))}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </ChartCard>
          );
        })
      )}
    </main>
  );
}
