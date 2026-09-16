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
import { calculateFunnelStepItems } from '@/lib/orgs/funnel-goals-synthesizer';
import type { FunnelStepsOutcome } from '@growthos/firebase-orm-models';

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

  /*
    Proactive recommendations, built from what this project has actually measured.

    This page used to hand the recommender a literal for every performance field - the same
    `roas: 3.8`, `conversions: 45`, `cpaUsd: 18`, `clicks: 1000`, `impressions: 40000` for
    every campaign, and `spend30dUsd` as `dailyBudgetUsd * 20` - plus a hardcoded two-step
    funnel with a 62% drop-off. None of it came from anywhere.

    That was not only invented, it defeated the guard added when
    `recommendation-synthesizer` was fixed to skip campaigns without a measured ROAS: a
    literal 3.8 is never null, so the "scale this high-performing campaign" branch fired for
    every campaign on every project - and it is approvable against a real ad account. The
    constant also sat permanently above the 3.5 threshold and below nothing, so the opposite
    branch (pause a campaign under 1.8) could never fire at all.

    Nothing measures ROAS, conversions, CTR or CPA yet, so those stay null and the
    ROAS-driven recommendations correctly produce nothing. The funnel is the project's own or
    absent - never a stand-in.
  */
  let funnelOutcome: FunnelStepsOutcome | null = null;
  try {
    funnelOutcome = await queryProjectFunnelSteps(orgId, projectId);
  } catch {
    funnelOutcome = null;
  }

  const funnelSteps =
    funnelOutcome && funnelOutcome.ok ? calculateFunnelStepItems(funnelOutcome.steps) : [];

  const proactiveRecs = synthesizeProactiveRecommendations(
    targetViews.map((tv) => ({
      id: tv.id,
      targetId: tv.id,
      label: tv.label,
      platform: 'meta_ads' as const,
      status: (tv.campaignStatus || 'enabled') as 'enabled' | 'paused' | 'removed' | 'none',
      // Real: it is the budget the campaign is configured with.
      dailyBudgetUsd: tv.dailyBudgetUsd,
      spend30dUsd: null,
      impressions: null,
      clicks: null,
      ctrPct: null,
      cpaUsd: null,
      conversions: null,
      roas: null,
    })),
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

