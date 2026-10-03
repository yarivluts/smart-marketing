import { notFound, redirect } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { can } from '@growthos/shared';
import { Puzzle, PlusCircle } from 'lucide-react';
import { OrgShell } from '@/components/orgs/org-shell';
import {
  PpPage,
  PpPageHeader,
  PpCard,
  PpPill,
  PpEmptyState,
} from '@/components/pastel/primitives';
import { getServerSession } from '@/lib/auth/get-server-session';
import { resolveOrgSessionContext } from '@/lib/orgs/session-context';
import { findActiveMembership } from '@/lib/orgs/access';
import { listPluginManifestsForOrg } from '@/lib/orgs/queries';
import { groupManifestsByPluginId, toPluginManifestView } from '@/lib/orgs/plugin-view';
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
 * project-scoped Plugins page (`.../projects/:projectId/plugins`).
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

  const manifests = await listPluginManifestsForOrg(orgId);
  const families = groupManifestsByPluginId(manifests.map(toPluginManifestView));

  const t = await getTranslations('PluginRegistry');

  return (
    <OrgShell locale={locale} orgId={orgId}>
      <PpPage>
        <PpPageHeader
          eyebrow={t('eyebrow')}
          title={t('title')}
          description={t('description')}
        />

        {/* Register Manifest Section */}
        <PpCard
          title={t('registerHeading')}
          icon={PlusCircle}
          iconAccent="primary"
        >
          <RegisterPluginManifestForm orgId={orgId} />
        </PpCard>

        {/* Registered Plugins Section */}
        <section className="space-y-4">
          <div className="flex items-center gap-2.5">
            <h2 className="font-pp-display text-pp-headline-md font-bold text-pp-on-surface">
              {t('registeredHeading')}
            </h2>
            <PpPill accent="primary">{families.length}</PpPill>
          </div>

          {families.length === 0 ? (
            <PpEmptyState
              icon={Puzzle}
              title={t('noManifests')}
            />
          ) : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {families.map((family) => (
                <PpCard
                  key={family.pluginId}
                  title={family.displayName}
                  subtitle={family.pluginId}
                  icon={Puzzle}
                  iconAccent="primary"
                >
                  <ul className="divide-y divide-pp-surface-container space-y-2">
                    {family.versions.map((version) => (
                      <li
                        key={version.id}
                        className="flex flex-col gap-1 pt-2 first:pt-0"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <PpPill accent="primary">
                            {t('versionLine', { version: version.version, type: version.type })}
                          </PpPill>
                          <span className="font-mono text-pp-label-sm text-pp-outline">
                            {version.id.slice(0, 8)}
                          </span>
                        </div>
                        <p className="text-pp-body-sm text-pp-on-surface-variant">
                          {t('scopesLine', { scopes: version.scopes.join(', ') })}
                        </p>
                      </li>
                    ))}
                  </ul>
                </PpCard>
              ))}
            </div>
          )}
        </section>
      </PpPage>
    </OrgShell>
  );
}
