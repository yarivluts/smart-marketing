import { notFound, redirect } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { can } from '@growthos/shared';
import { isAdPlatformProvider, listActiveAttachmentsForProject } from '@growthos/firebase-orm-models';
import { Plug } from 'lucide-react';
import { OrgShell } from '@/components/orgs/org-shell';
import { PageHero } from '@/components/viz/page-hero';
import { ConnectionsApp, type ConnectionRow } from '@/components/integrations/connections-app';
import { getServerSession } from '@/lib/auth/get-server-session';
import { resolveOrgSessionContext } from '@/lib/orgs/session-context';
import { findActiveMembership } from '@/lib/orgs/access';
import { listOrgProjects, listSharedCredentials } from '@/lib/orgs/queries';
import { ensureFirestoreOrm } from '@/lib/firebase/firestore';
import { isMetaOAuthConfigured, metaConnectHref } from '@/lib/integrations/meta';
import { toConnectionView } from '@/lib/integrations/connections';
import { CONNECTION_PLATFORMS, type ConnectionPlatform } from '@/lib/integrations/connection-fields';

type PageProps = Readonly<{
  params: Promise<{ locale: string; orgId: string }>;
  searchParams: Promise<{ projectId?: string; returnTo?: string; platform?: string }>;
}>;

export async function generateMetadata({ params }: PageProps) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'Connections' });
  return { title: t('title') };
}

/**
 * The organization's ad platform connections: Meta, Google Ads and TikTok, each with its accounts,
 * whether they still work and the projects using them, plus a guided way to connect one. Members
 * see the state; adding and checking need `resources.manage`. A link can name the project to attach
 * to (`projectId`), the platform to open (`platform`) and the page to go back to (`returnTo`).
 */
export default async function ConnectionsPage({ params, searchParams }: PageProps): Promise<React.ReactElement> {
  const { locale, orgId } = await params;
  const query = await searchParams;
  setRequestLocale(locale);
  const t = await getTranslations('Connections');

  const session = await getServerSession();
  if (!session) redirect(`/${locale}/login?from=%2Forgs%2F${orgId}%2Fconnections`);
  const { user, memberships, bindings } = await resolveOrgSessionContext(session);
  if (!findActiveMembership(memberships, orgId)) notFound();
  const canManage = can(bindings, { type: 'user', id: user.id }, 'resources.manage', { orgId });

  await ensureFirestoreOrm();
  const [projects, credentials] = await Promise.all([listOrgProjects(orgId), listSharedCredentials(orgId)]);
  const attachments = await Promise.all(projects.map(async (project) => ({ project, rows: await listActiveAttachmentsForProject(orgId, project.id) })));
  const projectsOf = (credentialId: string) => attachments.filter(({ rows }) => rows.some((row) => row.resource_kind === 'credential' && row.resource_id === credentialId)).map(({ project }) => project.name);
  const connections: ConnectionRow[] = credentials
    .filter((credential) => isAdPlatformProvider(credential.provider) && !credential.archived_at)
    .map((credential) => ({ ...toConnectionView(credential), projects: projectsOf(credential.id) }));

  const projectId = query.projectId && projects.some((project) => project.id === query.projectId) ? query.projectId : null;
  // Only a page of this org: never an open redirect.
  const returnTo = query.returnTo && query.returnTo.startsWith(`/${locale}/orgs/${orgId}/`) && !query.returnTo.startsWith('//') ? query.returnTo : null;
  const focus = (CONNECTION_PLATFORMS as readonly string[]).includes(query.platform ?? '') ? (query.platform as ConnectionPlatform) : null;
  const metaHref = canManage && isMetaOAuthConfigured() ? metaConnectHref({ orgId, locale, projectId, returnTo }) : null;

  return (
    <OrgShell locale={locale} orgId={orgId}>
      <div className="flex flex-col gap-6">
        <PageHero icon={Plug} eyebrow={t('eyebrow')} title={t('title')} description={t('description')} />
        <ConnectionsApp
          orgId={orgId}
          canManage={canManage}
          projects={projects.map((project) => ({ id: project.id, name: project.name }))}
          connections={connections}
          initialProjectId={projectId}
          returnTo={returnTo}
          metaConnectHref={metaHref}
          focus={focus}
        />
      </div>
    </OrgShell>
  );
}
