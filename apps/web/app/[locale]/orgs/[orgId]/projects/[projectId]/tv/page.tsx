import { KeyRound, LayoutDashboard, MonitorSmartphone, RefreshCw, Tv } from 'lucide-react';
import { StatCard } from '@/components/ui/stat-card';
import { ChartCard, EmptyState, FlowDiagram, PageHero } from '@/components/viz';
import { notFound, redirect } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { can } from '@growthos/shared';
import { getServerSession } from '@/lib/auth/get-server-session';
import { resolveOrgSessionContext } from '@/lib/orgs/session-context';
import { findActiveMembership } from '@/lib/orgs/access';
import { listBoardsForProject, listOrgProjects, listTvPairingsForProject } from '@/lib/orgs/queries';
import { toBoardSummaryView } from '@/lib/orgs/board-view';
import { toTvPairingSummaryView } from '@/lib/orgs/tv-pairing-view';
import { TvPairingList } from '@/components/orgs/tv-pairing-list';
import { ClaimTvPairingForm } from '@/components/orgs/claim-tv-pairing-form';

type PageProps = Readonly<{
  params: Promise<{ locale: string; orgId: string; projectId: string }>;
}>;

export async function generateMetadata({ params }: PageProps) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'TvPairing' });
  return { title: t('metaTitle') };
}

/**
 * War-room TV mode admin (KAN-67, E12.3, plan `10 §2.3`): pair a new TV by
 * typing the code it's displaying, choose which board(s) it rotates
 * through, and manage (see "last seen", revoke) every TV already paired to
 * this project. Gated on `dashboards.write` — the same permission every
 * other war-room admin surface (boards, goals, win rules) in this codebase
 * reuses, the pattern `win-rules/page.tsx` documents for its own reuse of
 * it.
 */
export default async function TvPairingPage({ params }: PageProps): Promise<React.ReactElement> {
  const { locale, orgId, projectId } = await params;
  setRequestLocale(locale);

  const session = await getServerSession();
  if (!session) {
    redirect(`/${locale}/login?from=%2Forgs%2F${orgId}%2Fprojects%2F${projectId}%2Ftv`);
  }

  const { user, memberships, bindings } = await resolveOrgSessionContext(session);
  const membership = findActiveMembership(memberships, orgId);
  if (!membership || !can(bindings, { type: 'user', id: user.id }, 'dashboards.write', { orgId, projectId })) {
    notFound();
  }

  const projects = await listOrgProjects(orgId);
  const project = projects.find((candidate) => candidate.id === projectId);
  if (!project) {
    notFound();
  }

  const [boards, pairings] = await Promise.all([
    listBoardsForProject(orgId, projectId),
    listTvPairingsForProject(orgId, projectId),
  ]);
  const boardViews = boards.map(toBoardSummaryView);
  const pairingViews = pairings.filter((pairing) => !pairing.revoked_at).map(toTvPairingSummaryView);
  const t = await getTranslations('TvPairing');

  const boardsInRotation = new Set(pairingViews.flatMap((pairing) => pairing.boardIds)).size;

  return (
    <main className="container mx-auto flex max-w-6xl flex-col gap-6 py-10">
      <PageHero icon={Tv} eyebrow={t('eyebrow')} title={t('title', { projectName: project.name })} description={t('description')}>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <StatCard title={t('kpiPaired')} value={pairingViews.length} icon={MonitorSmartphone} />
          <StatCard title={t('kpiBoards')} value={boardViews.length} icon={LayoutDashboard} />
          <StatCard title={t('kpiRotation')} value={boardsInRotation} icon={RefreshCw} />
        </div>
      </PageHero>

      <ChartCard title={t('flowTitle')} description={t('flowDescription')} icon={KeyRound}>
        <FlowDiagram
          label={t('flowTitle')}
          height={200}
          nodes={[
            { id: 'open', label: t('flowOpen'), sublabel: t('flowOpenSub'), status: 'ok', href: '/tv' },
            { id: 'code', label: t('flowCode'), sublabel: t('flowCodeSub'), status: 'ok' },
            { id: 'claim', label: t('flowClaim'), sublabel: t('flowClaimSub'), status: boardViews.length > 0 ? 'ok' : 'warn' },
            { id: 'rotate', label: t('flowRotate'), sublabel: t('flowRotateSub'), value: String(boardsInRotation), status: pairingViews.length > 0 ? 'ok' : 'idle' },
          ]}
          edges={[
            { source: 'open', target: 'code', status: 'ok' },
            { source: 'code', target: 'claim', status: 'ok' },
            { source: 'claim', target: 'rotate', animated: pairingViews.length > 0, status: pairingViews.length > 0 ? 'ok' : 'idle' },
          ]}
        />
      </ChartCard>

      <div className="grid gap-6 lg:grid-cols-2">
        <ChartCard title={t('pairedHeading')} icon={MonitorSmartphone}>
          {pairingViews.length === 0 ? (
            <EmptyState compact icon={Tv} title={t('noPaired')} description={t('emptyPairedDescription')} />
          ) : (
            <TvPairingList orgId={orgId} projectId={projectId} pairings={pairingViews} boards={boardViews} />
          )}
        </ChartCard>

        <ChartCard title={t('pairHeading')} icon={KeyRound}>
          {boardViews.length === 0 ? (
            <p className="text-xs text-muted-foreground">{t('noBoards')}</p>
          ) : (
            <ClaimTvPairingForm orgId={orgId} projectId={projectId} boards={boardViews} />
          )}
        </ChartCard>
      </div>
    </main>
  );
}
