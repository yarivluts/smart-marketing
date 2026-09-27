import { notFound, redirect } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { can } from '@growthos/shared';
import { FileCode2, KeyRound, Layers, PackagePlus, Puzzle, Rocket } from 'lucide-react';
import { OrgShell } from '@/components/orgs/org-shell';
import { StatCard } from '@/components/ui/stat-card';
import { Badge } from '@/components/ui/badge';
import { BarList } from '@/components/viz/bar-list';
import { ChartCard } from '@/components/viz/chart-card';
import { DonutChart } from '@/components/viz/donut-chart';
import { EmptyState } from '@/components/viz/empty-state';
import { PageHero } from '@/components/viz/page-hero';
import { getServerSession } from '@/lib/auth/get-server-session';
import { resolveOrgSessionContext } from '@/lib/orgs/session-context';
import { findActiveMembership } from '@/lib/orgs/access';
import { listOrgProjects, listPluginInstallsForProject, listPluginManifestsForOrg } from '@/lib/orgs/queries';
import { groupManifestsByPluginId, hasActiveInstall, toPluginInstallView, toPluginManifestView } from '@/lib/orgs/plugin-view';
import { topCounts } from '@/lib/orgs/workspace-view';
import { RegisterPluginManifestForm } from '@/components/orgs/register-plugin-manifest-form';

type PageProps = Readonly<{
  params: Promise<{ locale: string; orgId: string }>;
}>;

export async function generateMetadata({ params }: PageProps) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'PluginRegistry' });
  return { title: t('metaTitle') };
}

/**
 * An org's plugin registry (KAN-46, plan `08 §4`/`12 §5`): register a new
 * `plugin.yaml` manifest version and browse every version registered so
 * far, grouped by plugin id. Gated on `plugin.install` — the only
 * permission the plan's catalog (`08 §5.3`) defines for this whole surface.
 * Installing a registered manifest into a project happens on the
 * project-scoped Plugins page (`.../projects/:projectId/plugins`). The
 * adoption counts come from each project's own install records.
 */
export default async function PluginRegistryPage({
  params,
}: PageProps): Promise<React.ReactElement> {
  const { locale, orgId } = await params;
  setRequestLocale(locale);

  const session = await getServerSession();
  if (!session) {
    redirect(`/${locale}/login?from=%2Forgs%2F${orgId}%2Fplugins`);
  }

  const { user, memberships, bindings } = await resolveOrgSessionContext(session);
  const membership = findActiveMembership(memberships, orgId);
  if (!membership || !can(bindings, { type: 'user', id: user.id }, 'plugin.install', { orgId })) {
    notFound();
  }

  const [manifests, projects] = await Promise.all([listPluginManifestsForOrg(orgId), listOrgProjects(orgId)]);
  const families = groupManifestsByPluginId(manifests.map(toPluginManifestView));
  const installsByProject = await Promise.all(projects.map(async (project) => (await listPluginInstallsForProject(orgId, project.id)).map(toPluginInstallView)));
  // How many projects have each plugin actively installed (installed or disabled, not uninstalled).
  const adoption = new Map(families.map((family) => [family.pluginId, installsByProject.filter((installs) => hasActiveInstall(installs, family.pluginId)).length]));
  const activeInstallCount = [...adoption.values()].reduce((sum, count) => sum + count, 0);
  const versionCount = families.reduce((sum, family) => sum + family.versions.length, 0);
  const distinctScopes = new Set(families.flatMap((family) => family.versions.flatMap((version) => version.scopes)));
  const typeCounts = topCounts(families.map((family) => family.versions[family.versions.length - 1].type));

  const t = await getTranslations('PluginRegistry');
  const numberFormat = new Intl.NumberFormat(locale);

  return (
    <OrgShell locale={locale} orgId={orgId}>
      <main className="container mx-auto flex max-w-6xl flex-col gap-6 py-10">
        <PageHero icon={Puzzle} eyebrow={t('eyebrow')} title={t('title')} description={t('heroDescription')}>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard title={t('kpiPlugins')} value={numberFormat.format(families.length)} icon={Puzzle} />
            <StatCard title={t('kpiVersions')} value={numberFormat.format(versionCount)} icon={Layers} />
            <StatCard title={t('kpiScopes')} value={numberFormat.format(distinctScopes.size)} icon={KeyRound} />
            <StatCard title={t('kpiInstalls')} value={numberFormat.format(activeInstallCount)} icon={Rocket} subtext={t('kpiInstallsSubtext', { count: projects.length })} />
          </div>
        </PageHero>

        {families.length > 0 ? (
          <div className="grid gap-6 lg:grid-cols-2">
            <ChartCard title={t('typesTitle')} description={t('typesDescription')} icon={Layers}>
              <DonutChart
                label={t('typesTitle')}
                centerValue={numberFormat.format(families.length)}
                centerLabel={t('typesCenter')}
                data={typeCounts.map((entry) => ({ label: entry.key, value: entry.count }))}
                size={150}
              />
            </ChartCard>
            <ChartCard title={t('adoptionTitle')} description={t('adoptionDescription', { count: projects.length })} icon={Rocket}>
              {activeInstallCount === 0 ? (
                <EmptyState compact icon={Rocket} title={t('adoptionEmpty')} description={t('adoptionEmptyHint')} />
              ) : (
                <BarList
                  items={families.map((family) => ({ key: family.pluginId, label: family.pluginId, value: adoption.get(family.pluginId) ?? 0 }))}
                  valueFormatter={(value) => t('adoptionValue', { count: value })}
                  maxItems={8}
                />
              )}
            </ChartCard>
          </div>
        ) : null}

        <div className="grid gap-6 lg:grid-cols-5">
          <ChartCard className="lg:col-span-3" title={t('registeredHeading')} icon={Puzzle}>
            {families.length === 0 ? (
              <EmptyState compact icon={Puzzle} title={t('noManifests')} description={t('noManifestsHint')} />
            ) : (
              <ul className="flex flex-col gap-3">
                {families.map((family) => {
                  const latest = family.versions[family.versions.length - 1];
                  const installs = adoption.get(family.pluginId) ?? 0;
                  return (
                    <li key={family.pluginId} className="flex flex-col gap-3 rounded-xl border border-border bg-background/60 p-4 text-sm">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex min-w-0 items-start gap-3">
                          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                            <Puzzle className="h-4 w-4" aria-hidden="true" />
                          </div>
                          <div className="min-w-0">
                            <span className="block font-semibold text-foreground">{family.displayName}</span>
                            <span className="block truncate font-mono text-xs text-muted-foreground" dir="ltr">
                              {family.pluginId}
                            </span>
                          </div>
                        </div>
                        <div className="flex shrink-0 flex-col items-end gap-1">
                          <Badge variant="info" size="sm">
                            {latest.type}
                          </Badge>
                          <span className="text-[11px] text-muted-foreground">{t('familyInstalls', { count: installs })}</span>
                        </div>
                      </div>
                      <ol className="flex flex-col gap-1.5 border-s-2 border-border ps-3">
                        {family.versions.map((version) => (
                          <li key={version.id} className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                            <span className="font-medium text-foreground" dir="ltr">
                              {t('versionLine', { version: version.version, type: version.type })}
                            </span>
                            <span dir="ltr">{t('scopesLine', { scopes: version.scopes.join(', ') })}</span>
                          </li>
                        ))}
                      </ol>
                    </li>
                  );
                })}
              </ul>
            )}
          </ChartCard>
          <ChartCard className="lg:col-span-2" title={t('registerHeading')} description={t('registerDescription')} icon={PackagePlus}>
            <RegisterPluginManifestForm orgId={orgId} />
            <p className="mt-3 flex items-start gap-2 text-xs text-muted-foreground">
              <FileCode2 className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              {t('registerFootnote')}
            </p>
          </ChartCard>
        </div>
      </main>
    </OrgShell>
  );
}
