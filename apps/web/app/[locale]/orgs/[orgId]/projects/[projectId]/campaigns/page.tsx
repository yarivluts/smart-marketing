import { notFound, redirect } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { can } from '@growthos/shared';
import { getServerSession } from '@/lib/auth/get-server-session';
import { resolveOrgSessionContext } from '@/lib/orgs/session-context';
import { findActiveMembership } from '@/lib/orgs/access';
import {
  listActiveAttachmentsForProject,
  listAutomationActionsForProject,
  listAutomationTargetStatesForProject,
  listOrgProjects,
  listSharedCredentials,
  getCampaignSpendBreakdownForProject,
} from '@/lib/orgs/queries';
import {
  findCampaignDraftForTarget,
  toAutomationConnectionOptions,
  toAutomationTargetView,
} from '@/lib/orgs/automation-view';
import { buildUnifiedAdsCockpitData } from '@/lib/orgs/ads-performance-synthesizer';
import { AdsPerformanceDashboard } from '@/components/orgs/ads-performance-dashboard';
import type { CampaignDraftView } from '@/components/orgs/campaign-creatives-panel';
import type { CampaignSpendBreakdownOutcome } from '@/lib/orgs/queries';

type PageProps = Readonly<{
  params: Promise<{ locale: string; orgId: string; projectId: string }>;
}>;

export async function generateMetadata({ params }: PageProps) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'Campaigns' });
  return { title: t('metaTitle') };
}

/**
 * Unified Ads & Performance Cockpit (Milestone 1):
 * Consolidates Meta Ads and Google Ads campaigns, visual creative previews,
 * blended executive KPI metrics, live spend, ROAS, 1-click status toggles,
 * and inline daily budget controls with zero-config instant synthesis.
 */
export default async function CampaignsPage({ params }: PageProps): Promise<React.ReactElement> {
  const { locale, orgId, projectId } = await params;
  setRequestLocale(locale);

  const session = await getServerSession();
  if (!session) {
    redirect(`/${locale}/login?from=%2Forgs%2F${orgId}%2Fprojects%2F${projectId}%2Fcampaigns`);
  }

  const { user, memberships, bindings } = await resolveOrgSessionContext(session);
  const membership = findActiveMembership(memberships, orgId);
  const principal = { type: 'user' as const, id: user.id };

  const canExecute = can(bindings, principal, 'automation.execute', { orgId });
  const canReadDashboards = can(bindings, principal, 'dashboards.read', { orgId });
  const canWriteDashboards = can(bindings, principal, 'dashboards.write', { orgId });

  if (!membership || (!canExecute && !canReadDashboards && !canWriteDashboards)) {
    notFound();
  }

  let spendOutcome: CampaignSpendBreakdownOutcome | null = null;
  try {
    spendOutcome = await getCampaignSpendBreakdownForProject(orgId, projectId);
  } catch {
    spendOutcome = null;
  }

  const [projects, targets, actions, attachments, credentials] = await Promise.all([
    listOrgProjects(orgId),
    listAutomationTargetStatesForProject(orgId, projectId),
    listAutomationActionsForProject(orgId, projectId),
    listActiveAttachmentsForProject(orgId, projectId),
    listSharedCredentials(orgId),
  ]);

  const project = projects.find((candidate) => candidate.id === projectId);
  if (!project) {
    notFound();
  }

  const connections = toAutomationConnectionOptions(attachments, credentials);
  const targetViews = targets.map(toAutomationTargetView);

  const lastActionAtByTarget = new Map<string, string>();
  const activeActivationActionIdByTarget = new Map<string, string>();
  const draftsByTargetId = new Map<string, CampaignDraftView>();

  for (const action of actions) {
    if (!lastActionAtByTarget.has(action.target_id)) {
      lastActionAtByTarget.set(action.target_id, action.proposed_at);
    }
    if (
      action.action_type === 'campaign_activation' &&
      (action.status === 'executed' || action.status === 'verified') &&
      !activeActivationActionIdByTarget.has(action.target_id)
    ) {
      activeActivationActionIdByTarget.set(action.target_id, action.id);
    }
  }

  for (const target of targetViews) {
    const draft = findCampaignDraftForTarget(actions, target.id) as CampaignDraftView | undefined;
    if (draft) {
      draftsByTargetId.set(target.id, draft);
    }
  }

  const { items, summary } = buildUnifiedAdsCockpitData(
    targetViews,
    spendOutcome,
    draftsByTargetId,
    lastActionAtByTarget,
    activeActivationActionIdByTarget,
  );

  return (
    <main className="container mx-auto flex max-w-7xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8">
      <AdsPerformanceDashboard
        orgId={orgId}
        projectId={projectId}
        projectName={project.name}
        items={items}
        summary={summary}
        rawTargets={targetViews}
        connections={connections}
        canExecute={canExecute}
        spendOutcome={spendOutcome}
      />
    </main>
  );
}
