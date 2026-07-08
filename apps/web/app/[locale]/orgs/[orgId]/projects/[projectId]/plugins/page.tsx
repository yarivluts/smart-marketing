import { notFound, redirect } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { can } from '@growthos/shared';
import { getServerSession } from '@/lib/auth/get-server-session';
import { resolveOrgSessionContext } from '@/lib/orgs/session-context';
import { findActiveMembership } from '@/lib/orgs/access';
import { listOrgProjects, listPluginInstallsForProject, listPluginManifestsForOrg } from '@/lib/orgs/queries';
import { hasActiveInstall, toPluginInstallView, toPluginManifestView } from '@/lib/orgs/plugin-view';
import { InstallPluginForm } from '@/components/orgs/install-plugin-form';
import { PluginInstallList } from '@/components/orgs/plugin-install-list';

type PageProps = Readonly<{
  params: Promise<{ locale: string; orgId: string; projectId: string }>;
}>;

export async function generateMetadata({ params }: PageProps) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'ProjectPlugins' });
  return { title: t('metaTitle') };
}

/**
 * A project's installed plugins (KAN-46, plan `08 §4`): install a manifest
 * version registered in the org's registry (a scope-consent screen), and
 * enable/disable/uninstall existing installs. Gated on `plugin.install`,
 * the same permission the org-level registry page (`.../orgs/:orgId/plugins`)
 * uses.
 */
export default async function ProjectPluginsPage({ params }: PageProps): Promise<React.ReactElement> {
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

  const [projects, manifests, installs] = await Promise.all([
    listOrgProjects(orgId),
    listPluginManifestsForOrg(orgId),
    listPluginInstallsForProject(orgId, projectId),
  ]);
  const project = projects.find((candidate) => candidate.id === projectId);
  if (!project) {
    notFound();
  }

  const manifestViews = manifests.map(toPluginManifestView);
  const installViews = installs.map(toPluginInstallView);
  // A plugin already actively installed (installed/disabled) can't be installed again until it's
  // uninstalled first (installPlugin's own PluginAlreadyInstalledError) — filtered out here rather
  // than left for the form to discover via a failed submit.
  const installableManifests = manifestViews.filter((manifest) => !hasActiveInstall(installViews, manifest.pluginId));

  const t = await getTranslations('ProjectPlugins');

  return (
    <main className="container mx-auto flex max-w-3xl flex-col gap-8 py-16">
      <h1 className="text-3xl font-bold tracking-tight">{t('title', { projectName: project.name })}</h1>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">{t('installHeading')}</h2>
        {installableManifests.length === 0 && manifestViews.length > 0 ? (
          <p className="text-muted-foreground">{t('allManifestsInstalled')}</p>
        ) : (
          <InstallPluginForm orgId={orgId} projectId={projectId} manifests={installableManifests} />
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">{t('installsHeading')}</h2>
        <PluginInstallList orgId={orgId} projectId={projectId} installs={installViews} />
      </section>
    </main>
  );
}
