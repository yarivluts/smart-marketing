import { notFound, redirect } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { can } from '@growthos/shared';
import { Link } from '@/i18n/navigation';
import { getServerSession } from '@/lib/auth/get-server-session';
import { resolveOrgSessionContext } from '@/lib/orgs/session-context';
import { findActiveMembership } from '@/lib/orgs/access';
import { listBoardsForProject, listOrgProjects } from '@/lib/orgs/queries';
import { toBoardSummaryView } from '@/lib/orgs/board-view';
import { CreateBoardForm } from '@/components/orgs/create-board-form';

type PageProps = Readonly<{
  params: Promise<{ locale: string; orgId: string; projectId: string }>;
}>;

export async function generateMetadata({ params }: PageProps) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'Boards' });
  return { title: t('metaTitle') };
}

/**
 * A project's dashboard boards (KAN-60, plan `13 §E11.2`, `10 §2.2`): every
 * board created in this project, plus a form to create a new (empty) one —
 * tiles are added from the board's own grid editor. Gated on
 * `dashboards.write` for the whole page, the same "whole feature, not just
 * mutation, is admin-only" posture every other project admin surface in
 * this codebase uses.
 */
export default async function BoardsPage({ params }: PageProps): Promise<React.ReactElement> {
  const { locale, orgId, projectId } = await params;
  setRequestLocale(locale);

  const session = await getServerSession();
  if (!session) {
    redirect(`/${locale}/login?from=%2Forgs%2F${orgId}%2Fprojects%2F${projectId}%2Fboards`);
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

  // Only reached once `projectId` is confirmed to belong to this org —
  // `listBoardsForProject` itself throws `ProjectNotFoundError` for a
  // project id that doesn't (unlike most list queries in this codebase,
  // which just return an empty result for one), and this page has no error
  // boundary to turn that into the 404 `notFound()` above already gives a
  // bad project id via the same non-enumeration posture KAN-26 established.
  const boards = await listBoardsForProject(orgId, projectId);
  const boardViews = boards.map(toBoardSummaryView);
  const t = await getTranslations('Boards');

  return (
    <main className="container mx-auto flex max-w-3xl flex-col gap-8 py-16">
      <h1 className="text-3xl font-bold tracking-tight">{t('title', { projectName: project.name })}</h1>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">{t('boardsHeading')}</h2>
        {boardViews.length === 0 ? (
          <p className="text-muted-foreground">{t('noBoards')}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {boardViews.map((board) => (
              <li key={board.id} className="flex items-center justify-between rounded-md border border-input px-3 py-2 text-sm">
                <Link className="font-medium underline" href={`/orgs/${orgId}/projects/${projectId}/boards/${board.id}`}>
                  {board.name}
                </Link>
                <span className="text-xs text-muted-foreground">{t('tileCountLabel', { count: board.tileCount })}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">{t('createHeading')}</h2>
        <CreateBoardForm orgId={orgId} projectId={projectId} />
      </section>
    </main>
  );
}
