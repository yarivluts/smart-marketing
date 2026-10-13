import 'server-only';
import {
  getCurrentGrowthPilot,
  listGrowthActivity,
  listGrowthLandingPages,
  listGrowthProposals,
  listGrowthTargets,
} from '@growthos/firebase-orm-models';
import { ensureFirestoreOrm } from '@/lib/firebase/firestore';
import { toGrowthActivityView, toGrowthLandingPageView, toGrowthPilotView, toGrowthProposalView, toGrowthTargetView, type GrowthPilotPageData } from './view';

/** Everything the Growth Pilot page shows for a project; null before a pilot was started. */
export async function loadGrowthPilotPage(organizationId: string, projectId: string): Promise<GrowthPilotPageData | null> {
  await ensureFirestoreOrm();
  const pilot = await getCurrentGrowthPilot(organizationId, projectId);
  if (!pilot) return null;
  const [targets, proposals, activity, landingPages] = await Promise.all([
    listGrowthTargets(organizationId, projectId, pilot.id),
    listGrowthProposals(organizationId, projectId, pilot.id),
    listGrowthActivity(organizationId, projectId, pilot.id),
    listGrowthLandingPages(organizationId, projectId, pilot.id),
  ]);
  return {
    pilot: toGrowthPilotView(pilot),
    targets: targets.map(toGrowthTargetView),
    proposals: proposals.map(toGrowthProposalView),
    activity: activity.map(toGrowthActivityView),
    landingPages: landingPages.map(toGrowthLandingPageView),
  };
}
