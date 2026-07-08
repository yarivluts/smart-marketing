import { notFound, redirect } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { can } from '@growthos/shared';
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
export default async function PluginRegistryPage({ params }: PageProps): Promise<React.ReactElement> {
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
    <main className="container mx-auto flex max-w-3xl flex-col gap-8 py-16">
      <h1 className="text-3xl font-bold tracking-tight">{t('title')}</h1>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">{t('registerHeading')}</h2>
        <RegisterPluginManifestForm orgId={orgId} />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">{t('registeredHeading')}</h2>
        {families.length === 0 ? (
          <p className="text-muted-foreground">{t('noManifests')}</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {families.map((family) => (
              <li key={family.pluginId} className="flex flex-col gap-2 rounded-md border border-input px-3 py-2 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <span className="font-medium">{family.displayName}</span>
                  <span className="text-xs text-muted-foreground">{family.pluginId}</span>
                </div>
                <ul className="flex flex-col gap-1">
                  {family.versions.map((version) => (
                    <li key={version.id} className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
                      <span>{t('versionLine', { version: version.version, type: version.type })}</span>
                      <span>{t('scopesLine', { scopes: version.scopes.join(', ') })}</span>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
