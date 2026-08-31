import { notFound, redirect } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { can } from '@growthos/shared';
import { getServerSession } from '@/lib/auth/get-server-session';
import { resolveOrgSessionContext } from '@/lib/orgs/session-context';
import { findActiveMembership } from '@/lib/orgs/access';
import {
  getActiveAutomationGuardrailPolicy,
  getAutomationKillSwitchStatus,
  listActiveAttachmentsForProject,
  listAutomationActionsForProject,
  listAutomationTargetStatesForProject,
  listOrgProjects,
  listSharedCredentials,
} from '@/lib/orgs/queries';
import {
  toAutomationActionView,
  toAutomationConnectionOptions,
  toAutomationGuardrailPolicyView,
  toAutomationTargetView,
} from '@/lib/orgs/automation-view';
import { AutomationHubDashboard } from '@/components/orgs/automation-hub-dashboard';
import { synthesizeProactiveRecommendations } from '@/lib/orgs/recommendation-synthesizer';

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

  const [projects, killSwitchStatus, policy, targets, actions, activeAttachments, credentials] = await Promise.all([
    listOrgProjects(orgId),
    getAutomationKillSwitchStatus(orgId),
    getActiveAutomationGuardrailPolicy(orgId, projectId),
    listAutomationTargetStatesForProject(orgId, projectId),
    listAutomationActionsForProject(orgId, projectId),
    listActiveAttachmentsForProject(orgId, projectId),
    listSharedCredentials(orgId),
  ]);
  const project = projects.find((candidate) => candidate.id === projectId);
  if (!project) {
    notFound();
  }

  const targetViews = targets.map(toAutomationTargetView);
  const actionViews = actions.map(toAutomationActionView);
  const connectionOptions = toAutomationConnectionOptions(activeAttachments, credentials);

  // Synthesize proactive recommendations based on active project targets
  const proactiveRecs = synthesizeProactiveRecommendations(
    targetViews.map((tv) => ({
      id: `sim-${tv.id}`,
      targetId: tv.id,
      label: tv.label,
      platform: 'meta_ads' as const,
      status: (tv.campaignStatus || 'enabled') as 'enabled' | 'paused' | 'removed' | 'none',
      dailyBudgetUsd: tv.dailyBudgetUsd,
      spend30dUsd: tv.dailyBudgetUsd * 20,
      impressions: 40000,
      clicks: 1000,
      ctrPct: 2.5,
      cpaUsd: 18,
      conversions: 45,
      roas: 3.8,
    })),
    [
      { stepOrder: 0, stageKey: 'view', stageLabel: 'Product View', customerCount: 1000, conversionPercent: 100, dropOffPercent: 0 },
      { stepOrder: 1, stageKey: 'checkout', stageLabel: 'Checkout Form', customerCount: 380, conversionPercent: 38, dropOffPercent: 62 },
    ],
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

