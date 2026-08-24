import { notFound, redirect } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { can } from '@growthos/shared';
import { getServerSession } from '@/lib/auth/get-server-session';
import { resolveOrgSessionContext } from '@/lib/orgs/session-context';
import { findActiveMembership } from '@/lib/orgs/access';
import {
  listOrgProjects,
  listWinRulesForProject,
  listRecentWinEventsForProject,
} from '@/lib/orgs/queries';
import { MarketingWinRulesDashboard } from '@/components/orgs/win-rules/marketing-win-rules-dashboard';

type PageProps = Readonly<{
  params: Promise<{ locale: string; orgId: string; projectId: string }>;
}>;

export async function generateMetadata({ params }: PageProps) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'WinRules' });
  return { title: t('metaTitle') };
}

/**
 * A project's predefined marketing win rules & real-time celebration war room:
 * Delivers 100% out-of-the-box marketing win events (Enterprise Deals, High-Ticket Orders,
 * ROAS Records, Milestone Celebrations) and live feed for team motivation.
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

  const rawRules = await listWinRulesForProject(orgId, projectId);
  const rawEvents = await listRecentWinEventsForProject(orgId, projectId);

  const rules = rawRules.map((r) => ({
    id: r.id,
    name: r.name,
    schemaName: r.schema_name,
    winType: r.win_type,
    active: r.active,
    label: r._demo_label ?? r.name,
    firedToday: r._demo_fired_today ?? 0,
  }));

  const events = rawEvents.map((e) => ({
    id: e.id,
    winRuleName: e.win_rule_name,
    winType: e.win_type,
    title: e._demo_title ?? (typeof e.payload?.title === 'string' ? e.payload.title : `${e.win_rule_name} Fired`),
    amount: e._demo_amount ?? (typeof e.payload?.amount === 'string' ? e.payload.amount : ''),
    occurredAt: e.occurred_at,
  }));

  return (
    <main className="container mx-auto flex max-w-6xl flex-col gap-10 py-10 px-4 sm:px-6">
      <MarketingWinRulesDashboard
        orgId={orgId}
        projectId={projectId}
        projectName={project.name}
        rules={rules}
        events={events}
      />
    </main>
  );
}

