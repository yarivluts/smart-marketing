import { notFound, redirect } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { can } from '@growthos/shared';
import { getServerSession } from '@/lib/auth/get-server-session';
import { resolveOrgSessionContext } from '@/lib/orgs/session-context';
import { findActiveMembership } from '@/lib/orgs/access';
import {
  getActiveAutomationGuardrailPolicy,
  getAutomationKillSwitchStatus,
  getCampaignSpendBreakdownForProject,
  listActiveAttachmentsForProject,
  listAutomationActionsForProject,
  listAutomationTargetStatesForProject,
  listOrgProjects,
  listSharedCredentials,
  queryProjectFunnelSteps,
} from '@/lib/orgs/queries';
import {
  toAutomationActionView,
  toAutomationConnectionOptions,
  toAutomationGuardrailPolicyView,
  toAutomationTargetView,
} from '@/lib/orgs/automation-view';
import { AutomationHubDashboard } from '@/components/orgs/automation-hub-dashboard';
import { synthesizeProactiveRecommendations } from '@/lib/orgs/recommendation-synthesizer';
import { buildUnifiedAdsCockpitData } from '@/lib/orgs/ads-performance-synthesizer';
import { calculateFunnelStepItems, type FunnelStepItem } from '@/lib/orgs/funnel-goals-synthesizer';

type PageProps = Readonly<{
  params: Promise<{ locale: string; orgId: string; projectId: string }>;
}>;

export async function generateMetadata({ params }: PageProps) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'Automation' });
  return { title: t('metaTitle') };
}

/**
 * A project's KAN-71 & Milestone 3 Automation Hub Cockpit:
 * Unifies proactive recommendation cards, 1-click execution & dry-run diffs,
 * full audit trail with 1-click rollback, and guardrail policies.
 */
export default async function AutomationPage({ params }: PageProps): Promise<React.ReactElement> {
  const { locale, orgId, projectId } = await params;
  setRequestLocale(locale);

  const session = await getServerSession();
  if (!session) {
    redirect(`/${locale}/login?from=%2Forgs%2F${orgId}%2Fprojects%2F${projectId}%2Fautomation`);
  }

  const { user, memberships, bindings } = await resolveOrgSessionContext(session);
  const membership = findActiveMembership(memberships, orgId);
  const principal = { type: 'user' as const, id: user.id };
  if (!membership || !can(bindings, principal, 'automation.execute', { orgId })) {
    notFound();
  }
  const canApprove = can(bindings, principal, 'automation.approve', { orgId });

  const [
    projects,
    killSwitchStatus,
    policy,
    targets,
    actions,
    activeAttachments,
    credentials,
    spendOutcome,
    funnelOutcome,
  ] = await Promise.all([
    listOrgProjects(orgId),
    getAutomationKillSwitchStatus(orgId),
    getActiveAutomationGuardrailPolicy(orgId, projectId),
    listAutomationTargetStatesForProject(orgId, projectId),
    listAutomationActionsForProject(orgId, projectId),
    listActiveAttachmentsForProject(orgId, projectId),
    listSharedCredentials(orgId),
    getCampaignSpendBreakdownForProject(orgId, projectId).catch(() => ({ ok: false as const, reason: 'query_error' as const })),
    queryProjectFunnelSteps(orgId, projectId).catch(() => null),
  ]);
  const project = projects.find((candidate) => candidate.id === projectId);
  if (!project) {
    if (projects.length > 0) {
      redirect(`/${locale}/orgs/${orgId}/projects/${projects[0].id}/automation`);
    }
    redirect(`/${locale}/orgs/${orgId}`);
  }

  const targetViews = targets.map(toAutomationTargetView);
  const actionViews = actions.map(toAutomationActionView);
  const connectionOptions = toAutomationConnectionOptions(activeAttachments, credentials);

  // Build unified campaign items joining Firestore targets with BigQuery spend breakdown
  const { items: unifiedCampaigns } = buildUnifiedAdsCockpitData(
    targetViews,
    spendOutcome && spendOutcome.ok ? spendOutcome : null,
  );

  // Derive real funnel steps or fallback to baseline steps
  const funnelSteps: FunnelStepItem[] =
    funnelOutcome && funnelOutcome.ok && funnelOutcome.steps.length > 0
      ? calculateFunnelStepItems(
          funnelOutcome.steps.map((s, idx) => ({
            stageKey: s.stageKey,
            stepOrder: s.stepOrder ?? idx,
            customerCount: s.customerCount,
            conversionRateFromFirst: s.conversionRateFromFirst,
          })),
        )
      : [
          { stepOrder: 0, stageKey: 'view', stageLabel: 'Product View', customerCount: 1000, conversionPercent: 100, dropOffPercent: 0 },
          { stepOrder: 1, stageKey: 'checkout', stageLabel: 'Checkout Form', customerCount: 380, conversionPercent: 38, dropOffPercent: 62 },
        ];

  // Synthesize proactive recommendations based on live unified campaign stats and funnel steps
  const proactiveRecs = synthesizeProactiveRecommendations(
    unifiedCampaigns,
    funnelSteps,
  );

  return (
    <main className="container mx-auto max-w-5xl py-8">
      <AutomationHubDashboard
        orgId={orgId}
        projectId={projectId}
        projectName={project.name}
        killSwitchStatus={killSwitchStatus}
        policy={toAutomationGuardrailPolicyView(policy)}
        targets={targetViews}
        actions={actionViews}
        connections={connectionOptions}
        proactiveRecommendations={proactiveRecs}
        canExecute={true}
        canApprove={canApprove}
      />
    </main>
  );
}

