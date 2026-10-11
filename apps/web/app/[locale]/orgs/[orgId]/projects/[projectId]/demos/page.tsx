import { notFound, redirect } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { CalendarCheck, CalendarClock, CalendarX, GitBranch, Info, ListChecks, Presentation, Target, Users } from 'lucide-react';
import { can } from '@growthos/shared';
import { SALES_PACK_PLUGIN_ID } from '@growthos/firebase-orm-models';
import { getServerSession } from '@/lib/auth/get-server-session';
import { resolveOrgSessionContext } from '@/lib/orgs/session-context';
import { findActiveMembership } from '@/lib/orgs/access';
import { builtinMetricPacks, getDemoFunnelForProject, listOrgPeople, listOrgProjects, listPluginInstallsForProject } from '@/lib/orgs/queries';
import { hasActiveInstall, toPluginInstallView } from '@/lib/orgs/plugin-view';
import { buildDemoFlow, toDemoFunnelView } from '@/lib/orgs/sales-view';
import { PackSetupLanding } from '@/components/orgs/pack-setup-landing';
import { StatCard } from '@/components/ui/stat-card';
import { BarList, ChartCard, EmptyState, FlowDiagram, PageHero, TrendChart } from '@/components/viz';
import { Link } from '@/i18n/navigation';

type PageProps = Readonly<{
  params: Promise<{ locale: string; orgId: string; projectId: string }>;
}>;

export async function generateMetadata({ params }: PageProps) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'Demos' });
  return { title: t('metaTitle') };
}

/**
 * A project's sales demo pipeline (KAN-92, plan `14 §Gap 9`: "demo/meeting
 * events in the SaaS pack ... and the paying_no_demo-style lists via Gap
 * 5's segments. We do NOT build a CRM — we read/write to one."): demos
 * scheduled/held/no-show and the show rate, plus a per-rep breakdown —
 * gated on `ingest.write`, same "whole feature, not just mutation, is
 * admin-only" posture the sibling Support/Feedback/Churn Reasons pages take
 * for their own read-only analytics surfaces. Computed live from bounded,
 * landed `demo_event` raw records (`getDemoFunnelForProject`) — no
 * warehouse dependency, so this page renders correctly even before a dbt
 * build has run; the Sales Pipeline pack's own metrics still register on
 * install so board tiles/goals can target them too.
 *
 * The AC's "recent demos feed" is deliberately not a dedicated feed section
 * here — once the `demo_event` schema is registered (by installing the
 * pack below), it's automatically browsable on the existing generic
 * `/record-feed` page (KAN-81), which already generalizes "pick any
 * registered event schema, browse its recent records" — this page just
 * links to it rather than duplicating that machinery.
 *
 * The AC's "paying_no_demo-style work list" no longer needs a denormalized
 * field or a connector change to build: KAN-93 (after this page's own doc
 * comment named the gap) added cross-schema `event_conditions` to the
 * segment engine, and KAN-103 wired the plan's own curated "paying, no
 * demo" example into the Segments page's AI-suggested-lists panel, so a
 * human can build that exact list there in one click (once Stripe's
 * `stripe_subscription` schema is also registered) — see the link below,
 * shown only to a caller who can already reach the Segments page.
 *
 * A real calendar/CRM connector (Calendly, HubSpot, Salesforce) is
 * deferred — needs a human-provisioned API key, same posture Stripe/GA4/
 * KAN-82/KAN-84/KAN-87/KAN-90 established for their own third-party
 * connectors; this schema is what a future connector (or a manual admin
 * action) would land data under.
 */
export default async function DemosPage({ params }: PageProps): Promise<React.ReactElement> {
  const { locale, orgId, projectId } = await params;
  setRequestLocale(locale);

  const session = await getServerSession();
  if (!session) {
    redirect(`/${locale}/login?from=%2Forgs%2F${orgId}%2Fprojects%2F${projectId}%2Fdemos`);
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
  const packInstalled = hasActiveInstall(installViews, SALES_PACK_PLUGIN_ID);

  const t = await getTranslations('Demos');

  if (!packInstalled) {
    const installablePacks = builtinMetricPacks().filter((pack) => pack.pluginId === SALES_PACK_PLUGIN_ID);
    return (
      <PackSetupLanding
        orgId={orgId}
        projectId={projectId}
        icon={Presentation}
        eyebrow={t('eyebrow')}
        title={t('title', { projectName: project.name })}
        intro={t('setupIntro')}
        featuresTitle={t('setupFeaturesTitle')}
        installTitle={t('setupInstallTitle')}
        packs={installablePacks}
        features={[
          { key: 'pipeline', icon: GitBranch, title: t('setupFeaturePipelineTitle'), description: t('setupFeaturePipelineDescription') },
          { key: 'show-rate', icon: Target, title: t('setupFeatureShowRateTitle'), description: t('setupFeatureShowRateDescription') },
          { key: 'reps', icon: Users, title: t('setupFeatureRepsTitle'), description: t('setupFeatureRepsDescription') },
        ]}
      />
    );
  }

  const [funnelResult, people] = await Promise.all([getDemoFunnelForProject(orgId, projectId), listOrgPeople(orgId)]);
  const peopleById = new Map(people.map((person) => [person.id, { name: person.name, photoUrl: person.photo_url ?? null }]));
  const funnel = toDemoFunnelView(funnelResult, peopleById);
  const canManageDashboards = can(bindings, { type: 'user', id: user.id }, 'dashboards.write', { orgId, projectId });

  const numberFormat = new Intl.NumberFormat(locale);
  const formatShowRate = (rate: number | null): string => (rate === null ? t('rowValueUnavailable') : t('showRateValue', { value: Math.round(rate * 100) }));
  const flow = buildDemoFlow(funnel, {
    scheduled: t('scheduledLabel'),
    held: t('heldLabel'),
    noShow: t('noShowLabel'),
    shareOfOutcomes: (percent) => t('flowShareOfOutcomes', { percent }),
    formatCount: (value) => numberFormat.format(value),
    percent: (value) => t('showRateValue', { value }),
  });
  const hasAnyDemo = funnel.demosScheduled + funnel.demosHeld + funnel.demosNoShow > 0;

  return (
    <div className="container mx-auto flex max-w-6xl flex-col gap-6 py-10">
      <PageHero
        icon={Presentation}
        eyebrow={t('eyebrow')}
        title={t('title', { projectName: project.name })}
        description={t('description')}
      >
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard title={t('scheduledLabel')} value={numberFormat.format(funnel.demosScheduled)} icon={CalendarClock} />
          <StatCard title={t('heldLabel')} value={numberFormat.format(funnel.demosHeld)} icon={CalendarCheck} />
          <StatCard title={t('noShowLabel')} value={numberFormat.format(funnel.demosNoShow)} icon={CalendarX} />
          <StatCard
            title={t('showRateLabel')}
            value={formatShowRate(funnel.showRate)}
            progress={funnel.showRate !== null ? Math.round(funnel.showRate * 100) : undefined}
            icon={Target}
          />
        </div>
      </PageHero>

      {/* Every number on this page comes from a bounded read of the most recent
          raw events. Below the cap that read is the whole history and the counts
          are totals; above it they are a sample, and the show rate in particular
          stops describing the project at all — the window is the most recent N
          *events*, so it cuts across demo lifecycles at both ends (KAN-164).
          Said once, at the top, rather than per tile: it qualifies all of them. */}
      {funnel.sampledFrom !== null ? (
        <p className="flex items-start gap-2 rounded-xl border border-warning/40 bg-warning/10 px-4 py-3 text-sm text-foreground">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden="true" />
          {t('sampledNotice', { limit: funnel.sampledFrom })}
        </p>
      ) : null}

      <ChartCard title={t('funnelHeading')} description={t('flowDescription')} icon={GitBranch}>
        {hasAnyDemo ? (
          <FlowDiagram label={t('funnelHeading')} nodes={flow.nodes} edges={flow.edges} height={300} />
        ) : (
          <EmptyState icon={Presentation} title={t('funnelEmpty')} description={t('funnelEmptyDetail')} compact />
        )}
      </ChartCard>

      <div className="grid gap-6 lg:grid-cols-5">
        <ChartCard title={t('repBreakdownHeading')} description={t('repChartDescription')} icon={Users} className="lg:col-span-3" fill>
          {funnel.rows.length === 0 ? (
            <EmptyState icon={Users} title={t('repBreakdownEmpty')} compact />
          ) : (
            <TrendChart
              label={t('repBreakdownHeading')}
              xKey="rep"
              kind="bar"
              stacked
              data={funnel.rows.map((row) => ({ rep: row.name, held: row.demosHeld, noShow: row.demosNoShow }))}
              series={[
                { key: 'held', label: t('heldLabel'), color: 'hsl(var(--success))' },
                { key: 'noShow', label: t('noShowLabel'), color: 'hsl(var(--warning))' },
              ]}
            />
          )}
        </ChartCard>
        <ChartCard title={t('repShowRateHeading')} description={t('repShowRateDescription')} icon={Target} className="lg:col-span-2" fill>
          {funnel.rows.length === 0 ? (
            <EmptyState icon={Target} title={t('repBreakdownEmpty')} compact />
          ) : (
            <BarList
              items={funnel.rows.map((row) => ({
                key: row.repOrgPersonId,
                label: row.name,
                sublabel: t('repRowSummary', { held: row.demosHeld, noShow: row.demosNoShow, showRate: formatShowRate(row.showRate) }),
                value: row.showRate === null ? 0 : Math.round(row.showRate * 100),
              }))}
              valueFormatter={(value) => t('showRateValue', { value })}
              color="hsl(var(--success))"
            />
          )}
        </ChartCard>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Link
          href={{ pathname: `/orgs/${orgId}/projects/${projectId}/record-feed`, query: { schema: 'demo_event' } }}
          className="group flex items-start gap-3 rounded-2xl border border-border bg-card p-5 shadow-sm transition-colors hover:border-primary/50"
        >
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <ListChecks className="h-5 w-5" />
          </div>
          <div className="min-w-0 text-sm">
            <p className="text-muted-foreground">{t('recentDemosIntro')}</p>
            <p className="font-semibold text-primary underline-offset-4 group-hover:underline">{t('recentDemosLinkLabel')}</p>
          </div>
        </Link>
        {canManageDashboards ? (
          <Link
            href={{ pathname: `/orgs/${orgId}/projects/${projectId}/segments` }}
            className="group flex items-start gap-3 rounded-2xl border border-border bg-card p-5 shadow-sm transition-colors hover:border-primary/50"
          >
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Users className="h-5 w-5" />
            </div>
            <div className="min-w-0 text-sm">
              <p className="text-muted-foreground">{t('workListIntro')}</p>
              <p className="font-semibold text-primary underline-offset-4 group-hover:underline">{t('workListLinkLabel')}</p>
            </div>
          </Link>
        ) : null}
      </div>
    </div>
  );
}
