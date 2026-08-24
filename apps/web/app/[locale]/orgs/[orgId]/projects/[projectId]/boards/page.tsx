import { notFound, redirect } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { can } from '@growthos/shared';
import { getServerSession } from '@/lib/auth/get-server-session';
import { resolveOrgSessionContext } from '@/lib/orgs/session-context';
import { findActiveMembership } from '@/lib/orgs/access';
import {
  listActiveAttachmentsForProject,
  listOrgProjects,
  listPluginInstallsForProject,
} from '@/lib/orgs/queries';
import { GrowthDashboard } from '@/components/orgs/growth-dashboard';

type PageProps = Readonly<{
  params: Promise<{ locale: string; orgId: string; projectId: string }>;
}>;

export async function generateMetadata({ params }: PageProps) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'Boards' });
  return { title: t('metaTitle') };
}

/**
 * A project's predefined marketing growth dashboard:
 * Delivers 100% out-of-the-box, question-led intelligence across all digital
 * marketing channels with zero manual setup. Includes dedicated zones for
 * recurring subscriptions (SaaS MRR, Churn, LTV, Trial-to-Paid) and one-time
 * e-commerce orders (GMV, AOV, Cart Abandonment, Repeat Buyers).
 */
export default async function BoardsPage({ params }: PageProps): Promise<React.ReactElement> {
  const { locale, orgId, projectId } = await params;
  setRequestLocale(locale);

  const session = await getServerSession();
  if (!session) {
    redirect(`/${locale}/login?from=%2Forgs%2F${orgId}%2Fprojects%2F${projectId}%2Fboards`);
  }

  const { user, memberships, bindings } = await resolveOrgSessionContext(session);
  const membership = findActiveMembership(memberships, orgId);
  const principal = { type: 'user' as const, id: user.id };
  const canViewBoards = can(bindings, principal, 'dashboards.read', { orgId }) || can(bindings, principal, 'dashboards.write', { orgId });
  if (!membership || !canViewBoards) {
    notFound();
  }

  const projects = await listOrgProjects(orgId);
  const project = projects.find((candidate) => candidate.id === projectId);
  if (!project) {
    notFound();
  }

  const [attachments, pluginInstalls] = await Promise.all([
    listActiveAttachmentsForProject(orgId, projectId),
    listPluginInstallsForProject(orgId, projectId),
  ]);

  const hasGoogleAds = pluginInstalls.some((p) => p.plugin_id.includes('google')) || attachments.some((a) => a.resource_id.includes('google'));
  const hasMetaAds = pluginInstalls.some((p) => p.plugin_id.includes('meta') || p.plugin_id.includes('facebook')) || attachments.some((a) => a.resource_id.includes('meta') || a.resource_id.includes('facebook'));
  const hasWebPixel = pluginInstalls.some((p) => p.plugin_id.includes('easysign') || p.plugin_id.includes('landing-page') || p.plugin_id.includes('pixel') || p.plugin_id.includes('source'));

  const pluginPackNames = pluginInstalls
    .map((p) => {
      if (p.plugin_id.includes('landing-page')) return 'Landing Page Pack';
      if (p.plugin_id.includes('saas')) return 'SaaS Metric Pack';
      if (p.plugin_id.includes('ecommerce')) return 'E-Commerce Pack';
      return p.plugin_id.split('.').pop() ?? p.plugin_id;
    })
    .filter(Boolean);

  return (
    <main className="container mx-auto flex max-w-6xl flex-col gap-10 py-10 px-4 sm:px-6">
      <GrowthDashboard
        orgId={orgId}
        projectId={projectId}
        projectName={project.name}
        hasGoogleAds={hasGoogleAds}
        hasMetaAds={hasMetaAds}
        hasWebPixel={hasWebPixel}
        pluginPackNames={pluginPackNames}
      />
    </main>
  );
}
