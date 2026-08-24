import { notFound, redirect } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { can } from '@growthos/shared';
import { getServerSession } from '@/lib/auth/get-server-session';
import { resolveOrgSessionContext } from '@/lib/orgs/session-context';
import { findActiveMembership } from '@/lib/orgs/access';
import { listOrgProjects } from '@/lib/orgs/queries';
import { MarketingChannelsHub } from '@/components/orgs/plugins/marketing-channels-hub';

type PageProps = Readonly<{
  params: Promise<{ locale: string; orgId: string; projectId: string }>;
}>;

export async function generateMetadata({ params }: PageProps) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'Plugins' });
  return { title: t('metaTitle') };
}

/**
 * A project's marketing channels & ad platform connectors:
 * Out-of-the-box integrations for Google Ads (Search/PMax), Meta Ads (Pixel & CAPI),
 * TikTok Ads, Stripe billing, and instant website tracking pixel snippet.
 */
export default async function PluginsPage({ params }: PageProps): Promise<React.ReactElement> {
  const { locale, orgId, projectId } = await params;
  setRequestLocale(locale);

  const session = await getServerSession();
  if (!session) {
    redirect(`/${locale}/login?from=%2Forgs%2F${orgId}%2Fprojects%2F${projectId}%2Fplugins`);
  }

  const { user, memberships, bindings } = await resolveOrgSessionContext(session);
  const membership = findActiveMembership(memberships, orgId);
  if (!membership || !can(bindings, { type: 'user', id: user.id }, 'plugin.install', { orgId })) {
    notFound();
  }

  const projects = await listOrgProjects(orgId);
  const project = projects.find((candidate) => candidate.id === projectId);
  if (!project) {
    notFound();
  }

  return (
    <main className="container mx-auto flex max-w-6xl flex-col gap-10 py-10 px-4 sm:px-6">
      <MarketingChannelsHub orgId={orgId} projectId={projectId} projectName={project.name} />
    </main>
  );
}
