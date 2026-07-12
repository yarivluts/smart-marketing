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
  if (!membership || !can(bindings, { type: 'user', id: user.id }, 'dashboards.write', { orgId })) {
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

  return (
    <main className="container mx-auto flex max-w-3xl flex-col gap-8 py-16">
      <h1 className="text-3xl font-bold tracking-tight">{t('title', { projectName: project.name })}</h1>
      <p className="text-sm text-muted-foreground">{t('description')}</p>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">{t('pairedHeading')}</h2>
        {pairingViews.length === 0 ? (
          <p className="text-muted-foreground">{t('noPaired')}</p>
        ) : (
          <TvPairingList orgId={orgId} projectId={projectId} pairings={pairingViews} boards={boardViews} />
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">{t('pairHeading')}</h2>
        {boardViews.length === 0 ? (
          <p className="text-xs text-muted-foreground">{t('noBoards')}</p>
        ) : (
          <ClaimTvPairingForm orgId={orgId} projectId={projectId} boards={boardViews} />
        )}
      </section>
    </main>
  );
}
