import { notFound, redirect } from 'next/navigation';
import { setRequestLocale } from 'next-intl/server';
import { can } from '@growthos/shared';
import { getServerSession } from '@/lib/auth/get-server-session';
import { resolveOrgSessionContext } from '@/lib/orgs/session-context';
import { findActiveMembership } from '@/lib/orgs/access';
import { loadGrowthPilotPage } from '@/lib/growth-pilot/store';
import { GrowthPilotApp } from '@/components/growth-pilot/growth-pilot-app';

type PageProps = Readonly<{
  params: Promise<{ locale: string; orgId: string; projectId: string }>;
}>;

/**
 * Growth Pilot: one input - the website - and the AI proposes what to grow while the person approves,
 * rejects or asks for changes. Gated on `ai.use`, like the Ad Studio it builds on.
 */
export default async function GrowthPilotPage({ params }: PageProps): Promise<React.ReactElement> {
  const { locale, orgId, projectId } = await params;
  setRequestLocale(locale);
  const session = await getServerSession();
  if (!session) redirect(`/${locale}/login?from=%2Forgs%2F${orgId}%2Fprojects%2F${projectId}%2Fgrowth-pilot`);
  const { user, memberships, bindings } = await resolveOrgSessionContext(session);
  const membership = findActiveMembership(memberships, orgId);
  if (!membership || !can(bindings, { type: 'user', id: user.id }, 'ai.use', { orgId, projectId })) notFound();
  const initial = await loadGrowthPilotPage(orgId, projectId);
  return (
    <div className="container mx-auto flex max-w-6xl flex-col gap-6 py-8">
      <GrowthPilotApp orgId={orgId} projectId={projectId} initial={initial} />
    </div>
  );
}
