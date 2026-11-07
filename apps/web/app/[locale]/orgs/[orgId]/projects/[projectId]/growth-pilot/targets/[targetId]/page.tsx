import { notFound, redirect } from 'next/navigation';
import { setRequestLocale } from 'next-intl/server';
import { can } from '@growthos/shared';
import { getServerSession } from '@/lib/auth/get-server-session';
import { resolveOrgSessionContext } from '@/lib/orgs/session-context';
import { findActiveMembership } from '@/lib/orgs/access';
import { loadGrowthPilotPage } from '@/lib/growth-pilot/store';
import { isMetaOAuthConfigured, metaConnectHref } from '@/lib/integrations/meta';
import { resolveAdStudioVideoDeps } from '@/lib/ad-studio/engine';
import { GrowthTargetDetail } from '@/components/growth-pilot/target-detail';

type PageProps = Readonly<{
  params: Promise<{ locale: string; orgId: string; projectId: string; targetId: string }>;
}>;

/** How many feed lines the details page reads, so one item's history is not cut short by the others'. */
const DETAIL_ACTIVITY_LIMIT = 300;

/**
 * One item Growth Pilot is promoting, in full: progress, what is done (with links), what is happening,
 * what waits for the person, what else can be done, suggestions, change requests and its activity.
 * Push notifications about one item open here. Gated on `ai.use`, like the Growth Pilot page.
 */
export default async function GrowthTargetPage({ params }: PageProps): Promise<React.ReactElement> {
  const { locale, orgId, projectId, targetId } = await params;
  setRequestLocale(locale);
  const session = await getServerSession();
  const here = `/orgs/${orgId}/projects/${projectId}/growth-pilot/targets/${targetId}`;
  if (!session) redirect(`/${locale}/login?from=${encodeURIComponent(here)}`);
  const { user, memberships, bindings } = await resolveOrgSessionContext(session);
  const membership = findActiveMembership(memberships, orgId);
  const principal = { type: 'user' as const, id: user.id };
  if (!membership || !can(bindings, principal, 'ai.use', { orgId, projectId })) notFound();
  const initial = await loadGrowthPilotPage(orgId, projectId, { activityLimit: DETAIL_ACTIVITY_LIMIT });
  if (!initial || !initial.targets.some((target) => target.id === targetId)) notFound();
  const canConnect = can(bindings, principal, 'resources.manage', { orgId, projectId }) && isMetaOAuthConfigured();
  const canExecute = can(bindings, principal, 'automation.execute', { orgId, projectId });
  const connectHref = canConnect ? metaConnectHref({ orgId, projectId, locale, returnTo: `/${locale}${here}` }) : null;
  return (
    <div className="container mx-auto flex max-w-6xl flex-col gap-6 py-8">
      <GrowthTargetDetail
        orgId={orgId}
        projectId={projectId}
        targetId={targetId}
        initial={initial}
        metaConnectHref={connectHref}
        canExecute={canExecute}
        canAct
        videoAvailable={resolveAdStudioVideoDeps().omni !== null}
      />
    </div>
  );
}
