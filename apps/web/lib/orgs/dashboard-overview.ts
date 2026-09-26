import 'server-only';
import { can, type PolicyBinding } from '@growthos/shared';
import type { OnboardingStep, UserOrgMembership } from '@growthos/firebase-orm-models';
import { evaluateProjectSetupHealth, getOnboardingState, listOrgProjects, listRecentIngestBatchesForProject } from '@/lib/orgs/queries';
import { isActiveMembershipStatus } from '@/lib/orgs/membership-status';
import { summarizeProjectHealth, type ProjectHealthSnapshot } from '@/lib/orgs/workspace-view';

export interface DashboardProject {
  orgId: string;
  projectId: string;
  name: string;
  vertical: string | null;
  /** Null when the viewer may not read ingest health for this project (it needs `ingest.write`). */
  health: ProjectHealthSnapshot | null;
  /** The onboarding wizard's step; `null` when never started; `undefined` when the viewer cannot manage the project. */
  onboardingStep?: OnboardingStep | null;
  /** True when this project's health read failed, so the card says so instead of showing zeros. */
  healthUnavailable?: boolean;
}

export interface DashboardOrg {
  orgId: string;
  name: string;
  role: string;
  projects: DashboardProject[];
  /** Projects in the org beyond the per-dashboard cap, which are not read here. */
  hiddenProjectCount: number;
}

export interface DashboardOverview {
  orgs: DashboardOrg[];
  pendingInviteCount: number;
}

/** Bounds the Firestore reads one dashboard render makes: health is read for at most this many projects in total. */
export const DASHBOARD_PROJECT_CAP = 12;
/** How many recent ingest batches each project's card is computed from. */
const BATCHES_PER_PROJECT = 200;

/**
 * Everything the signed-in landing page shows, read for real: each active org, its projects, and -
 * for projects where the viewer holds `ingest.write` (the same gate as the Ingest Health page) -
 * the derived setup health and the recent ingest batches. Onboarding progress is read only where
 * the viewer holds `project.manage` (the wizard's own gate). Nothing is estimated or filled in.
 */
export async function loadDashboardOverview(input: {
  userId: string;
  memberships: readonly UserOrgMembership[];
  bindings: readonly PolicyBinding[];
  now: number;
}): Promise<DashboardOverview> {
  const principal = { type: 'user' as const, id: input.userId };
  const active = input.memberships.filter((membership) => isActiveMembershipStatus(membership.status));
  const pendingInviteCount = input.memberships.filter((membership) => membership.status === 'invited').length;

  const projectLists = await Promise.all(active.map((membership) => listOrgProjects(membership.organizationId)));
  let budget = DASHBOARD_PROJECT_CAP;

  const orgs = await Promise.all(
    active.map(async (membership, index) => {
      const orgId = membership.organizationId;
      const all = projectLists[index] ?? [];
      const shown = all.slice(0, Math.max(0, budget));
      budget -= shown.length;
      const projects = await Promise.all(
        shown.map(async (project): Promise<DashboardProject> => {
          const scope = { orgId, projectId: project.id };
          const canViewHealth = can([...input.bindings], principal, 'ingest.write', scope);
          const canManage = can([...input.bindings], principal, 'project.manage', scope);
          const base: DashboardProject = { orgId, projectId: project.id, name: project.name, vertical: project.vertical ?? null, health: null };
          try {
            const [report, batches, onboarding] = await Promise.all([
              canViewHealth ? evaluateProjectSetupHealth(orgId, project.id) : Promise.resolve(null),
              canViewHealth ? listRecentIngestBatchesForProject(orgId, project.id, BATCHES_PER_PROJECT) : Promise.resolve([]),
              canManage ? getOnboardingState(orgId, project.id) : Promise.resolve(undefined),
            ]);
            return {
              ...base,
              health: canViewHealth ? summarizeProjectHealth(report, batches, input.now) : null,
              ...(onboarding === undefined ? {} : { onboardingStep: onboarding ? onboarding.step : null }),
            };
          } catch {
            return { ...base, healthUnavailable: true };
          }
        }),
      );
      return { orgId, name: membership.organizationName, role: membership.role, projects, hiddenProjectCount: all.length - shown.length };
    }),
  );

  return { orgs, pendingInviteCount };
}
