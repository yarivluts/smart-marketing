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
import {
  PpPage,
  PpPageHeader,
  PpKpiGrid,
  PpKpiCard,
  PpCard,
  PpTable,
  PpEmptyState,
  PpPill,
  PpButton,
} from '@/components/pastel/primitives';
import { Video, Users, ExternalLink, Calendar, CheckCircle2, AlertCircle } from 'lucide-react';

type PageProps = Readonly<{
  params: Promise<{ locale: string; orgId: string; projectId: string }>;
}>;

export async function generateMetadata({ params }: PageProps) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'Demos' });
  return { title: t('metaTitle') };
}

/**
 * A project's sales demo pipeline (KAN-92):
 * Demos scheduled, held, no-show, show rate, and per-rep breakdown.
 *
 * Converted to Stitch Pastel Pulse design (desktop 01a066cd, mobile c0f5d4c3),
 * folding all real rep metrics and operational links without fake hot leads data.
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
    if (projects.length > 0) {
      redirect(`/${locale}/orgs/${orgId}/projects/${projects[0].id}/demos`);
    }
    redirect(`/${locale}/orgs/${orgId}`);
  }

  const installViews = installs.map(toPluginInstallView);
  const packInstalled = hasActiveInstall(installViews, SALES_PACK_PLUGIN_ID);

  const t = await getTranslations('Demos');

  if (!packInstalled) {
    const installablePacks = builtinMetricPacks().filter((pack) => pack.pluginId === SALES_PACK_PLUGIN_ID);
    return (
      <PpPage>
        <PpPageHeader
          eyebrow="SALES PACK REQUIRED"
          title={t('title', { projectName: project.name })}
          description={t('setupIntro')}
        />
        <PpCard title="Install Metric Pack" subtitle="Enable sales demo stage tracking and attendance analytics">
          <InstallBuiltinPackSection orgId={orgId} projectId={projectId} packs={installablePacks} />
        </PpCard>
      </PpPage>
    );
  }

  const [funnelResult, people] = await Promise.all([getDemoFunnelForProject(orgId, projectId), listOrgPeople(orgId)]);
  const peopleById = new Map(people.map((person) => [person.id, { name: person.name, photoUrl: person.photo_url ?? null }]));
  const funnel = toDemoFunnelView(funnelResult, peopleById);
  const canManageDashboards = can(bindings, { type: 'user', id: user.id }, 'dashboards.write', { orgId });

  const formatShowRate = (rate: number | null): string =>
    rate === null ? t('rowValueUnavailable') : t('showRateValue', { value: Math.round(rate * 100) });

  const isDataConnected =
    funnel.demosScheduled > 0 ||
    funnel.demosHeld > 0 ||
    funnel.demosNoShow > 0 ||
    funnel.rows.length > 0;

  return (
    <PpPage>
      {/* 1. Header */}
      <PpPageHeader
        eyebrow="SALES VELOCITY & DEMOS"
        meta={isDataConnected ? 'Live CRM Sync (Salesforce & HubSpot)' : 'Awaiting Ingestion'}
        title={t('title', { projectName: project.name })}
        description="Real-time demo stage telemetry, rep show rates, and autonomous high-intent pipeline triage"
        actions={
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-pp-secondary-container/60 px-3 py-1.5 text-xs font-semibold text-pp-secondary">
              <span className="w-1.5 h-1.5 rounded-full bg-pp-secondary animate-pulse" />
              <span>{isDataConnected ? 'TELEMETRY LIVE' : 'NO RECORDED DEMOS'}</span>
            </span>
          </div>
        }
      />

      {/* 2. Top KPI Deck */}
      <PpKpiGrid>
        <PpKpiCard
          label={t('scheduledLabel')}
          value={funnel.demosScheduled}
          valueSuffix="demos"
          accent="primary"
          footer="Total booked demonstrations"
        />
        <PpKpiCard
          label={t('heldLabel')}
          value={funnel.demosHeld}
          valueSuffix="held"
          badge="Completed"
          badgeAccent="mint"
          accent="mint"
          footer="Successful demo conversations"
        />
        <PpKpiCard
          label={t('noShowLabel')}
          value={funnel.demosNoShow}
          valueSuffix="missed"
          badge={funnel.demosNoShow > 0 ? 'No-Show' : 'Clean'}
          badgeAccent={funnel.demosNoShow > 0 ? 'error' : 'mint'}
          accent={funnel.demosNoShow > 0 ? 'error' : 'sky'}
          footer="Absent prospects"
        />
        <PpKpiCard
          label={t('showRateLabel')}
          value={formatShowRate(funnel.showRate)}
          badge="Conversion"
          badgeAccent="sky"
          accent="sky"
          footer="Attendance realization"
        />
      </PpKpiGrid>

      {/* 3. Section 1: Rep Performance Breakdown */}
      <PpCard
        title={t('repBreakdownHeading')}
        subtitle="Sales representatives ranked by completed meetings and show-up rates"
        icon={Users}
        iconAccent="primary"
        flush={funnel.rows.length > 0}
      >
        {funnel.rows.length === 0 ? (
          <PpEmptyState
            icon={Users}
            title={t('repBreakdownHeading')}
            description={t('repBreakdownEmpty')}
          />
        ) : (
          <PpTable>
            <thead>
              <tr>
                <th>Representative</th>
                <th>Demos Held</th>
                <th>No-Shows</th>
                <th>Show Rate</th>
              </tr>
            </thead>
            <tbody>
              {funnel.rows.map((row) => (
                <tr key={row.repOrgPersonId}>
                  <td className="font-semibold text-pp-on-surface">
                    <div className="flex items-center gap-2.5">
                      {row.photoUrl ? (
                        <img src={row.photoUrl} alt="" className="h-7 w-7 rounded-full object-cover" />
                      ) : (
                        <div className="h-7 w-7 rounded-full bg-pp-primary-fixed text-pp-primary flex items-center justify-center font-bold text-xs">
                          {row.name.slice(0, 2).toUpperCase()}
                        </div>
                      )}
                      <span>{row.name}</span>
                    </div>
                  </td>
                  <td className="tabular-nums font-mono text-pp-on-surface font-semibold">
                    {row.demosHeld}
                  </td>
                  <td className="tabular-nums font-mono text-pp-error">
                    {row.demosNoShow}
                  </td>
                  <td>
                    <PpPill
                      accent={
                        row.showRate !== null && row.showRate >= 0.7
                          ? 'mint'
                          : row.showRate !== null && row.showRate >= 0.5
                            ? 'amber'
                            : 'error'
                      }
                    >
                      {formatShowRate(row.showRate)}
                    </PpPill>
                  </td>
                </tr>
              ))}
            </tbody>
          </PpTable>
        )}
      </PpCard>

      {/* 4. Section 2: Operational Links */}
      <PpCard
        title="Operational Records & Smart Triage"
        subtitle="Browse raw event logs or build automated high-intent sales segments"
        icon={Video}
        iconAccent="mint"
      >
        <div className="space-y-4 text-xs">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-2xl bg-pp-subtle-inset p-4">
            <div>
              <p className="font-semibold text-sm text-pp-on-surface">Browse Demo Records Feed</p>
              <p className="text-pp-on-surface-variant mt-0.5">{t('recentDemosIntro')}</p>
            </div>
            <PpButton asChild variant="secondary" size="sm">
              <Link href={{ pathname: `/orgs/${orgId}/projects/${projectId}/record-feed`, query: { schema: 'demo_event' } }}>
                <ExternalLink className="h-3.5 w-3.5" />
                <span>{t('recentDemosLinkLabel')}</span>
              </Link>
            </PpButton>
          </div>

          {canManageDashboards && (
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-2xl bg-pp-subtle-inset p-4">
              <div>
                <p className="font-semibold text-sm text-pp-on-surface">Paying, No Demo Work List</p>
                <p className="text-pp-on-surface-variant mt-0.5">{t('workListIntro')}</p>
              </div>
              <PpButton asChild variant="secondary" size="sm">
                <Link href={{ pathname: `/orgs/${orgId}/projects/${projectId}/segments` }}>
                  <ExternalLink className="h-3.5 w-3.5" />
                  <span>{t('workListLinkLabel')}</span>
                </Link>
              </PpButton>
            </div>
          )}
        </div>
      </PpCard>
    </PpPage>
  );
}
