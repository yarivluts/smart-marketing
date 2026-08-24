import { notFound, redirect } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { can } from '@growthos/shared';
import { getServerSession } from '@/lib/auth/get-server-session';
import { resolveOrgSessionContext } from '@/lib/orgs/session-context';
import { findActiveMembership } from '@/lib/orgs/access';
import {
  getRepCollectionLeaderboardForProject,
  getTrialPipelineSummary,
  listActiveEventSchemaNames,
  listOrgPeople,
  listOrgProjects,
  listRecentWinEventsForProject,
  listWinRulesForProject,
} from '@/lib/orgs/queries';
import { toWinEventFeedItem, toWinRuleSummaryView } from '@/lib/orgs/win-rule-view';
import { toTrialPipelineWidgetView } from '@/lib/orgs/trial-pipeline-view';
import { toRepCollectionLeaderboardView } from '@/lib/orgs/rep-collection-view';
import { CreateWinRuleForm } from '@/components/orgs/create-win-rule-form';
import { WinRuleList } from '@/components/orgs/win-rule-list';
import { LiveWinFeed } from '@/components/orgs/live-win-feed';
import { WinEventHistoryList } from '@/components/orgs/win-event-history-list';
import { TrialPipelineWidget } from '@/components/orgs/trial-pipeline-widget';
import { RepCollectionLeaderboardWidget } from '@/components/orgs/rep-collection-leaderboard-widget';

type PageProps = Readonly<{
  params: Promise<{ locale: string; orgId: string; projectId: string }>;
}>;

export async function generateMetadata({ params }: PageProps) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'WinRules' });
  return { title: t('metaTitle') };
}

/**
 * A project's win rules (KAN-65, E12.2, plan `04 §6`): every rule defined in
 * this project, a form to create a new one, and a live feed of wins fired in
 * real time — gated on `dashboards.write` for the whole page, the same
 * "whole feature, not just mutation, is admin-only" posture `goals/page.tsx`
 * (which this page mirrors) uses.
 */
export default async function WinRulesPage({ params }: PageProps): Promise<React.ReactElement> {
  const { locale, orgId, projectId } = await params;
  setRequestLocale(locale);

  const session = await getServerSession();
  if (!session) {
    redirect(`/${locale}/login?from=%2Forgs%2F${orgId}%2Fprojects%2F${projectId}%2Fwin-rules`);
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

  const [winRules, eventSchemaNames, trialPipelineOutcome, recentWinEvents, repCollectionLeaderboard, people] = await Promise.all([
    listWinRulesForProject(orgId, projectId),
    listActiveEventSchemaNames(orgId, projectId),
    getTrialPipelineSummary(orgId, projectId),
    listRecentWinEventsForProject(orgId, projectId),
    getRepCollectionLeaderboardForProject(orgId, projectId, 'week'),
    listOrgPeople(orgId),
  ]);
  const winRuleViews = winRules.map(toWinRuleSummaryView);
  const trialPipelineView = toTrialPipelineWidgetView(trialPipelineOutcome);
  const winEventHistoryViews = recentWinEvents.map(toWinEventFeedItem);
  const repCollectionLeaderboardView = toRepCollectionLeaderboardView(
    repCollectionLeaderboard,
    new Map(people.map((person) => [person.id, person.name])),
  );
  const t = await getTranslations('WinRules');

  return (
    <main className="container mx-auto flex max-w-3xl flex-col gap-8 py-16">
      <h1 className="text-3xl font-bold tracking-tight">{t('title', { projectName: project.name })}</h1>

      <TrialPipelineWidget view={trialPipelineView} />
      <RepCollectionLeaderboardWidget view={repCollectionLeaderboardView} />

      {/* Persisted history (KAN-65 follow-up, session-B dogfooding QA 2026-08-18): the live feed
        below is a broadcast-only view that shows nothing once the tab wasn't open when a win fired
        — this section is the page-load render of the same `win_events` collection so nothing is
        missed. `listRecentWinEventsForProject` was already built and wired for exactly this
        purpose but never actually rendered anywhere until now. */}
      <WinEventHistoryList events={winEventHistoryViews} />

      <LiveWinFeed orgId={orgId} projectId={projectId} />

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">{t('rulesHeading')}</h2>
        <WinRuleList orgId={orgId} projectId={projectId} winRules={winRuleViews} />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">{t('createHeading')}</h2>
        {eventSchemaNames.length === 0 ? <p className="text-xs text-muted-foreground">{t('noEventSchemas')}</p> : null}
        {eventSchemaNames.length > 0 ? (
          <CreateWinRuleForm orgId={orgId} projectId={projectId} eventSchemaNames={eventSchemaNames} />
        ) : null}
      </section>
    </main>
  );
}
