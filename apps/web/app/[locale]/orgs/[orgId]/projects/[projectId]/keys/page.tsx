import { notFound, redirect } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { can } from '@growthos/shared';
import { getServerSession } from '@/lib/auth/get-server-session';
import { resolveOrgSessionContext } from '@/lib/orgs/session-context';
import { findActiveMembership } from '@/lib/orgs/access';
import { listApiKeysForProject, listEnvironmentsForProject, listOrgProjects } from '@/lib/orgs/queries';
import { CreateApiKeyForm } from '@/components/orgs/create-api-key-form';
import { RevokeApiKeyButton } from '@/components/orgs/revoke-api-key-button';

type PageProps = Readonly<{
  params: Promise<{ locale: string; orgId: string; projectId: string }>;
}>;

export async function generateMetadata({ params }: PageProps) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'ApiKeys' });
  return { title: t('metaTitle') };
}

/**
 * A project's API keys (KAN-30): mint scoped to one environment with a
 * least-privilege scope selection, see every key ever minted (active or
 * revoked) with its display-safe prefix and last-used time, and revoke one
 * immediately. This whole page — unlike KAN-27's resource library, which
 * lets any active member browse — is gated on `keys.manage`, matching the
 * story's own "Admin UI" framing: a key's scope list and usage metadata are
 * sensitive enough that only roles trusted to manage keys should see them
 * at all, not just mutate them.
 */
export default async function ProjectApiKeysPage({ params }: PageProps): Promise<React.ReactElement> {
  const { locale, orgId, projectId } = await params;
  setRequestLocale(locale);

  const session = await getServerSession();
  if (!session) {
    redirect(`/${locale}/login?from=%2Forgs%2F${orgId}%2Fprojects%2F${projectId}%2Fkeys`);
  }

  const { user, memberships, bindings } = await resolveOrgSessionContext(session);
  const membership = findActiveMembership(memberships, orgId);
  if (!membership || !can(bindings, { type: 'user', id: user.id }, 'keys.manage', { orgId })) {
    notFound();
  }

  const projects = await listOrgProjects(orgId);
  const project = projects.find((candidate) => candidate.id === projectId);
  if (!project) {
    notFound();
  }

  const [environments, apiKeys] = await Promise.all([
    listEnvironmentsForProject(orgId, projectId),
    listApiKeysForProject(orgId, projectId),
  ]);

  const t = await getTranslations('ApiKeys');
  const tEnv = await getTranslations('EnvBadge');
  // Client components can only receive plain serializable data across the
  // RSC boundary, never `@arbel/firebase-orm` model instances (their
  // internal ORM/connection state isn't serializable) — same reasoning as
  // `ProjectSwitcher` staying a server component instead of forwarding
  // `ProjectModel[]` to client code.
  const environmentOptions = environments.map((environment) => ({ id: environment.id, name: environment.name }));
  const environmentNameById = new Map(environmentOptions.map((environment) => [environment.id, environment.name]));

  return (
    <main className="container mx-auto flex max-w-3xl flex-col gap-8 py-16">
      <h1 className="text-3xl font-bold tracking-tight">{t('title', { projectName: project.name })}</h1>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">{t('existingKeysHeading')}</h2>
        {apiKeys.length === 0 ? (
          <p className="text-muted-foreground">{t('noKeys')}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {apiKeys.map((apiKey) => {
              const environmentName = environmentNameById.get(apiKey.environmentId);
              return (
                <li
                  key={apiKey.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-input px-3 py-2 text-sm"
                >
                  <div className="flex flex-col gap-1">
                    <span className="font-medium">
                      {apiKey.name} <code>{apiKey.keyPrefix}</code>
                      {environmentName ? ` (${tEnv(environmentName)})` : ''}
                    </span>
                    <span className="text-muted-foreground">{apiKey.scopes.join(', ')}</span>
                    <span className="text-muted-foreground">
                      {apiKey.revokedAt
                        ? t('revokedLabel')
                        : apiKey.lastUsedAt
                          ? t('lastUsedLabel', { lastUsedAt: apiKey.lastUsedAt })
                          : t('neverUsedLabel')}
                    </span>
                  </div>
                  {!apiKey.revokedAt ? (
                    <RevokeApiKeyButton orgId={orgId} projectId={projectId} apiKeyId={apiKey.id} />
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">{t('createKeyHeading')}</h2>
        {environmentOptions.length === 0 ? (
          <p className="text-muted-foreground">{t('noEnvironments')}</p>
        ) : (
          <CreateApiKeyForm orgId={orgId} projectId={projectId} environments={environmentOptions} />
        )}
      </section>
    </main>
  );
}
