import { notFound, redirect } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { can } from '@growthos/shared';
import { getServerSession } from '@/lib/auth/get-server-session';
import { resolveOrgSessionContext } from '@/lib/orgs/session-context';
import { findActiveMembership } from '@/lib/orgs/access';
import { listOrgProjects, listSegmentsForProject } from '@/lib/orgs/queries';
import { MarketingAudiencesDashboard } from '@/components/orgs/segments/marketing-audiences-dashboard';

type PageProps = Readonly<{
  params: Promise<{ locale: string; orgId: string; projectId: string }>;
}>;

export async function generateMetadata({ params }: PageProps) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'Segments' });
  return { title: t('metaTitle') };
}

/**
 * A project's smart marketing audiences & cohorts:
 * Delivers smart digital marketing audiences ready for 1-click sync
 * with Google Ads and Meta Ads. Zero manual setup.
 */
export default async function SegmentsPage({ params }: PageProps): Promise<React.ReactElement> {
  const { locale, orgId, projectId } = await params;
  setRequestLocale(locale);

  const session = await getServerSession();
  if (!session) {
    redirect(`/${locale}/login?from=%2Forgs%2F${orgId}%2Fprojects%2F${projectId}%2Fsegments`);
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

  const rawSegments = await listSegmentsForProject(orgId, projectId);
  const segments = rawSegments.map((s) => ({
    id: s.id,
    name: s.name,
    schemaName: s.schema_name,
    size: s._demo_size ?? 0,
    matchQuality: s._demo_match_quality ?? 90,
    channels: s._demo_channels ? s._demo_channels.split(',').map((c: string) => c.trim()) : ['google', 'meta'],
    tactic: s._demo_tactic ?? '',
    createdAt: s.created_at,
  }));

  return (
    <main className="container mx-auto flex max-w-6xl flex-col gap-10 py-10 px-4 sm:px-6">
      <MarketingAudiencesDashboard projectName={project.name} audiences={segments} />
    </main>
  );
}

