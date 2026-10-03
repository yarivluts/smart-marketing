import { notFound, redirect } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { can } from '@growthos/shared';
import { getServerSession } from '@/lib/auth/get-server-session';
import { resolveOrgSessionContext } from '@/lib/orgs/session-context';
import { findActiveMembership } from '@/lib/orgs/access';
import { listMcpOAuthGrantsForProject, listOrgProjects } from '@/lib/orgs/queries';
import { mcpApiUrl } from '@/lib/orgs/mcp-api-url';
import { McpHub } from '@/components/mcp/mcp-hub';

type PageProps = Readonly<{
  params: Promise<{ locale: string; orgId: string; projectId: string }>;
}>;

export async function generateMetadata({ params }: PageProps) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'McpHub' });
  return { title: t('metaTitle') };
}

/**
 * Dedicated project MCP (Model Context Protocol) Hub.
 * Provides interactive client configuration generators (Claude Desktop, Cursor,
 * Antigravity, Headless SDK), tool catalog explorer, in-browser connection tester,
 * and active OAuth grants management.
 */
export default async function ProjectMcpPage({ params }: PageProps): Promise<React.ReactElement> {
  const { locale, orgId, projectId } = await params;
  setRequestLocale(locale);

  const session = await getServerSession();
  if (!session) {
    redirect(`/${locale}/login?from=%2Forgs%2F${orgId}%2Fprojects%2F${projectId}%2Fmcp`);
  }

  const { user, memberships, bindings } = await resolveOrgSessionContext(session);
  const membership = findActiveMembership(memberships, orgId);
  if (
    !membership ||
    (!can(bindings, { type: 'user', id: user.id }, 'mcp.read', { orgId }) &&
      !can(bindings, { type: 'user', id: user.id }, 'keys.manage', { orgId }))
  ) {
    notFound();
  }

  const projects = await listOrgProjects(orgId);
  const project = projects.find((candidate) => candidate.id === projectId);
  if (!project) {
    if (projects.length > 0) {
      redirect(`/${locale}/orgs/${orgId}/projects/${projects[0].id}/mcp`);
    }
    redirect(`/${locale}/orgs/${orgId}`);
  }

  const grants = await listMcpOAuthGrantsForProject(orgId, projectId);
  const url = mcpApiUrl();

  return (
    <main className="container mx-auto flex flex-col gap-6 py-8 px-4 md:px-8 max-w-7xl">
      <McpHub
        orgId={orgId}
        projectId={projectId}
        projectName={project.name}
        mcpUrl={url}
        grants={grants}
      />
    </main>
  );
}
