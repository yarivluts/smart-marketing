import { notFound, redirect } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { can } from '@growthos/shared';
import { SALES_PACK_PLUGIN_ID } from '@growthos/firebase-orm-models';
import { getServerSession } from '@/lib/auth/get-server-session';
import { resolveOrgSessionContext } from '@/lib/orgs/session-context';
import { findActiveMembership } from '@/lib/orgs/access';
import { builtinMetricPacks, getDemoFunnelForProject, listOrgPeople, listOrgProjects, listPluginInstallsForProject } from '@/lib/orgs/queries';
import { hasActiveInstall, toPluginInstallView } from '@/lib/orgs/plugin-view';
import { toDemoFunnelView } from '@/lib/orgs/sales-view';
import { InstallBuiltinPackSection } from '@/components/orgs/install-builtin-pack-section';
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
 * The AC's "paying_no_demo-style work list" is deliberately not built here:
 * KAN-76/KAN-81's saved-segment engine (`segment.service.ts`) only ever
 * filters one *entity* schema's own fields, with no cross-schema join or
 * negation — expressing "paying AND no demo" would need either a
 * denormalized demo-status field on a paying-customer entity (no connector
 * populates one yet) or a segment-engine cross-schema join feature, both
 * out of this slice's scope. Once a project's customer entity carries such
 * a field, a human can already build that exact list with the existing
 * Segments page — no code change needed here.
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
  if (!membership || !can(bindings, { type: 'user', id: user.id }, 'ingest.write', { orgId })) {
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
      <main className="container mx-auto flex max-w-3xl flex-col gap-8 py-16">
        <h1 className="text-3xl font-bold tracking-tight">{t('title', { projectName: project.name })}</h1>
        <p className="text-sm text-muted-foreground">{t('setupIntro')}</p>
        <InstallBuiltinPackSection orgId={orgId} projectId={projectId} packs={installablePacks} />
      </main>
    );
  }

  const [funnelResult, people] = await Promise.all([getDemoFunnelForProject(orgId, projectId), listOrgPeople(orgId)]);
  const peopleById = new Map(people.map((person) => [person.id, { name: person.name, photoUrl: person.photo_url ?? null }]));
  const funnel = toDemoFunnelView(funnelResult, peopleById);

  const formatShowRate = (rate: number | null): string => (rate === null ? t('rowValueUnavailable') : t('showRateValue', { value: Math.round(rate * 100) }));

  return (
    <main className="container mx-auto flex max-w-3xl flex-col gap-8 py-16">
      <h1 className="text-3xl font-bold tracking-tight">{t('title', { projectName: project.name })}</h1>
      <p className="text-sm text-muted-foreground">{t('description')}</p>

      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-semibold tracking-tight">{t('funnelHeading')}</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="flex flex-col gap-1 rounded-md border border-input px-4 py-3">
            <span className="text-2xl font-bold tracking-tight">{funnel.demosScheduled}</span>
            <span className="text-xs text-muted-foreground">{t('scheduledLabel')}</span>
          </div>
          <div className="flex flex-col gap-1 rounded-md border border-input px-4 py-3">
            <span className="text-2xl font-bold tracking-tight">{funnel.demosHeld}</span>
            <span className="text-xs text-muted-foreground">{t('heldLabel')}</span>
          </div>
          <div className="flex flex-col gap-1 rounded-md border border-input px-4 py-3">
            <span className="text-2xl font-bold tracking-tight">{funnel.demosNoShow}</span>
            <span className="text-xs text-muted-foreground">{t('noShowLabel')}</span>
          </div>
          <div className="flex flex-col gap-1 rounded-md border border-input px-4 py-3">
            <span className="text-2xl font-bold tracking-tight">{formatShowRate(funnel.showRate)}</span>
            <span className="text-xs text-muted-foreground">{t('showRateLabel')}</span>
          </div>
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-semibold tracking-tight">{t('repBreakdownHeading')}</h2>
        {funnel.rows.length === 0 ? (
          <p className="text-muted-foreground">{t('repBreakdownEmpty')}</p>
        ) : (
          <ol className="flex flex-col gap-2">
            {funnel.rows.map((row) => (
              <li key={row.repOrgPersonId} className="flex items-center justify-between gap-3 rounded-md border border-input px-3 py-2 text-sm">
                <span className="flex items-center gap-2 font-medium">
                  {row.photoUrl ? (
                    <img src={row.photoUrl} alt="" className="h-6 w-6 rounded-full object-cover" />
                  ) : null}
                  {row.name}
                </span>
                <span className="text-muted-foreground">
                  {t('repRowSummary', { held: row.demosHeld, noShow: row.demosNoShow, showRate: formatShowRate(row.showRate) })}
                </span>
              </li>
            ))}
          </ol>
        )}
      </section>

      <p className="text-sm text-muted-foreground">
        {t('recentDemosIntro')}{' '}
        <Link href={{ pathname: `/orgs/${orgId}/projects/${projectId}/record-feed`, query: { schema: 'demo_event' } }} className="underline">
          {t('recentDemosLinkLabel')}
        </Link>
      </p>
    </main>
  );
}
