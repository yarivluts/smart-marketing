import { notFound, redirect } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { can } from '@growthos/shared';
import { getServerSession } from '@/lib/auth/get-server-session';
import { resolveOrgSessionContext } from '@/lib/orgs/session-context';
import { findActiveMembership } from '@/lib/orgs/access';
import {
  listEnvironmentsForProject,
  listOrgProjects,
  listPluginInstallsForProject,
  listPluginManifestsForOrg,
  listSourcePluginRunsForInstall,
} from '@/lib/orgs/queries';
import {
  hasActiveInstall,
  pluginInstallHealth,
  pluginTypeForInstall,
  sourceRunStatusLabelKey,
  toPluginInstallView,
  toPluginManifestView,
  toSourcePluginRunView,
} from '@/lib/orgs/plugin-view';
import { InstallPluginForm } from '@/components/orgs/install-plugin-form';
import { PluginHealthSummary } from '@/components/orgs/plugin-health-summary';
import { PluginInstallList } from '@/components/orgs/plugin-install-list';
import { TriggerSourcePluginRunButton } from '@/components/orgs/trigger-source-plugin-run-button';

type PageProps = Readonly<{
  params: Promise<{ locale: string; orgId: string; projectId: string }>;
}>;

export async function generateMetadata({ params }: PageProps) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'ProjectPlugins' });
  return { title: t('metaTitle') };
}

/**
 * A project's installed plugins (KAN-46, plan `08 §4`): browse a gallery of
 * installable plugins and install one (a config form rendered from its
 * `config_schema`, behind a scope-consent screen — KAN-48, plan `13 §E7.3`),
 * enable/disable/uninstall existing installs, and — for an active
 * `source`-type install — see its runtime health-at-a-glance plus full run
 * history (KAN-47/KAN-48). Gated on `plugin.install`, the same permission
 * the org-level registry page (`.../orgs/:orgId/plugins`) uses.
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

  const [projects, manifests, installs, environments] = await Promise.all([
    listOrgProjects(orgId),
    listPluginManifestsForOrg(orgId),
    listPluginInstallsForProject(orgId, projectId),
    listEnvironmentsForProject(orgId, projectId),
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

  // Only an active install of a `source`-type manifest has a runnable sync (KAN-47) — a disabled/
  // uninstalled install, or one of any other plugin type, has nothing to trigger here.
  const activeSourceInstalls = installViews.filter(
    (install) => install.status === 'installed' && pluginTypeForInstall(install, manifestViews) === 'source',
  );
  const sourceRunsByInstallId = new Map(
    await Promise.all(
      activeSourceInstalls.map(
        async (install) => [install.id, (await listSourcePluginRunsForInstall(orgId, projectId, install.id)).map(toSourcePluginRunView)] as const,
      ),
    ),
  );
  const environmentOptions = environments.map((environment) => ({ id: environment.id, name: environment.name }));

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

      {activeSourceInstalls.length > 0 ? (
        <section className="flex flex-col gap-4">
          <h2 className="text-lg font-semibold">{t('sourceRuntimeHeading')}</h2>
          {activeSourceInstalls.map((install) => {
            const runs = sourceRunsByInstallId.get(install.id) ?? [];
            const health = pluginInstallHealth(install, 'source', runs);
            return (
              <div key={install.id} className="flex flex-col gap-3 rounded-md border border-input px-3 py-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <span className="font-medium">{t('installLine', { pluginId: install.pluginId, version: install.version })}</span>
                  <TriggerSourcePluginRunButton orgId={orgId} projectId={projectId} installId={install.id} environments={environmentOptions} />
                </div>
                <PluginHealthSummary health={health} />
                <details className="flex flex-col gap-2">
                  <summary className="cursor-pointer text-sm font-medium text-muted-foreground">{t('sourceRunHistoryHeading')}</summary>
                  <div className="pt-2">
                    {runs.length === 0 ? (
                      <p className="text-muted-foreground">{t('sourceRunNoRuns')}</p>
                    ) : (
                      <ul className="flex flex-col gap-2">
                        {runs.map((run) => (
                          <li key={run.id} className="flex flex-col gap-1 rounded-md border border-input px-3 py-2 text-xs">
                            <span className="font-medium">
                              {t('sourceRunSummary', { status: t(sourceRunStatusLabelKey(run.status)), startedAt: run.startedAt })}
                            </span>
                            <span className="text-muted-foreground">{t('sourceRunAttemptsLine', { attempts: run.attempts })}</span>
                            <span className="text-muted-foreground">
                              {t('sourceRunCursorLine', {
                                before: run.cursorBefore ?? t('sourceRunCursorFromScratch'),
                                after: run.cursorAfter ?? t('sourceRunCursorFromScratch'),
                              })}
                            </span>
                            {run.recordsFetched !== null ? (
                              <span className="text-muted-foreground">
                                {t('sourceRunCountsLine', {
                                  fetched: run.recordsFetched,
                                  accepted: run.recordsAccepted ?? 0,
                                  quarantined: run.recordsQuarantined ?? 0,
                                  duplicate: run.recordsDuplicate ?? 0,
                                })}
                              </span>
                            ) : null}
                            {run.errorMessage ? (
                              <span className="text-destructive">{t('sourceRunErrorLine', { message: run.errorMessage })}</span>
                            ) : null}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </details>
              </div>
            );
          })}
        </section>
      ) : null}
    </main>
  );
}
