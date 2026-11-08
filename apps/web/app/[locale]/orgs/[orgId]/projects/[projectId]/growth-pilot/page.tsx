import { notFound, redirect } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { SlidersHorizontal } from 'lucide-react';
import { can } from '@growthos/shared';
import { getServerSession } from '@/lib/auth/get-server-session';
import { resolveOrgSessionContext } from '@/lib/orgs/session-context';
import { findActiveMembership } from '@/lib/orgs/access';
import { loadGrowthPilotPage } from '@/lib/growth-pilot/store';
import { isMetaOAuthConfigured, metaConnectHref } from '@/lib/integrations/meta';
import { GrowthPilotApp } from '@/components/growth-pilot/growth-pilot-app';
import { Link } from '@/i18n/navigation';

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
  const canConnect = can(bindings, { type: 'user', id: user.id }, 'resources.manage', { orgId, projectId }) && isMetaOAuthConfigured();
  const canExecute = can(bindings, { type: 'user', id: user.id }, 'automation.execute', { orgId, projectId });
  const canManage = can(bindings, { type: 'user', id: user.id }, 'project.manage', { orgId, projectId });
  const t = await getTranslations('GrowthPilot.settings');
  const connectHref = canConnect ? metaConnectHref({ orgId, projectId, locale, returnTo: `/${locale}/orgs/${orgId}/projects/${projectId}/growth-pilot` }) : null;
  return (
    <div className="container mx-auto flex max-w-6xl flex-col gap-6 py-8">
      <GrowthPilotApp orgId={orgId} projectId={projectId} initial={initial} metaConnectHref={connectHref} canExecute={canExecute} />
      {canManage ? (
        <Link href={`/orgs/${orgId}/projects/${projectId}/growth-pilot/settings`} className="inline-flex items-center gap-1.5 self-start text-sm font-medium text-muted-foreground hover:text-foreground" data-testid="growth-pilot-settings-link">
          <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
          {t('operatorLink')}
        </Link>
      ) : null}
    </div>
  );
}
