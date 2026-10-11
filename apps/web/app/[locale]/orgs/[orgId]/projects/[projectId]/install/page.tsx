import { notFound, redirect } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { KeyRound, ShieldCheck, Code2, Radio } from 'lucide-react';
import { can, buildInstallationReport } from '@growthos/shared';
import { verifyInstallationForEnvironment } from '@growthos/firebase-orm-models';
import { getServerSession } from '@/lib/auth/get-server-session';
import { resolveOrgSessionContext } from '@/lib/orgs/session-context';
import { findActiveMembership } from '@/lib/orgs/access';
import {
  listApiKeysForProject,
  listOrgProjects,
  listSchemaDefinitionsForProject,
} from '@/lib/orgs/queries';
import { resolveSelectedEnvironment } from '@/lib/orgs/selected-environment';
import { ensureFirestoreOrm } from '@/lib/firebase/firestore';
import { ingestApiUrl } from '@/lib/orgs/ingest-api-url';
import { createApiKeyHref } from '@/lib/orgs/create-api-key-link';
import { Link } from '@/i18n/navigation';
import { ChartCard, PageHero } from '@/components/viz';
import { InstallationCheck } from '@/components/orgs/installation-check';
import { InstallationCode } from '@/components/orgs/installation-code';

type PageProps = Readonly<{
  params: Promise<{ locale: string; orgId: string; projectId: string }>;
}>;

export async function generateMetadata({ params }: PageProps) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'Installation' });
  return { title: t('metaTitle') };
}

/**
 * Connecting a site to GrowthOS, in one place: the environment's keys (browser and server), the code
 * for every way to send (snippet, browser package, Node SDK, relay, CLI check), and a live check of
 * what really arrives for each expected schema. Gated on `ingest.write`, like Ingest health.
 */
export default async function InstallationPage({ params }: PageProps): Promise<React.ReactElement> {
  const { locale, orgId, projectId } = await params;
  setRequestLocale(locale);
  const session = await getServerSession();
  if (!session) {
    redirect(`/${locale}/login?from=%2Forgs%2F${orgId}%2Fprojects%2F${projectId}%2Finstall`);
  }
  const { user, memberships, bindings } = await resolveOrgSessionContext(session);
  const membership = findActiveMembership(memberships, orgId);
  if (
    !membership ||
    !can(bindings, { type: 'user', id: user.id }, 'ingest.write', { orgId, projectId })
  ) {
    notFound();
  }
  const t = await getTranslations('Installation');
  const { selected: environment } = await resolveSelectedEnvironment(orgId, projectId);
  const [projects, keys, schemaDefs] = await Promise.all([
    listOrgProjects(orgId),
    listApiKeysForProject(orgId, projectId),
    listSchemaDefinitionsForProject(orgId, projectId),
  ]);
  const project = projects.find((candidate) => candidate.id === projectId);
  if (!project) notFound();

  const activeKeys = keys.filter(
    (key) =>
      !key.revokedAt &&
      key.environmentId === environment?.id &&
      key.scopes.includes('ingest.write'),
  );
  const browserKeys = activeKeys.filter((key) => key.kind === 'publishable');
  const serverKeys = activeKeys.filter((key) => key.kind === 'secret');
  // The default checklist: what the project registered (touchpoint first - every website sends it).
  const registered = [
    ...new Set(
      schemaDefs
        .filter((def) => def.status === 'active' && def.kind !== 'measure')
        .map((def) => def.name),
    ),
  ].sort();
  const defaultExpected = ['touchpoint', ...registered.filter((name) => name !== 'touchpoint')];
  await ensureFirestoreOrm();
  const initial = environment
    ? await verifyInstallationForEnvironment({
        organizationId: orgId,
        projectId,
        environmentId: environment.id,
        expected: defaultExpected,
      })
    : { report: buildInstallationReport([], defaultExpected) };
  const apiBase = ingestApiUrl()
    .replace(/\/+$/, '')
    .replace(/\/v1\/ingest$/, '');
  const base = `/orgs/${orgId}/projects/${projectId}`;
  // The Keys page is gated on `keys.manage`; someone who can only write events is told who can.
  const canManageKeys = can(bindings, { type: 'user', id: user.id }, 'keys.manage', {
    orgId,
    projectId,
  });
  const createKeyHref = canManageKeys
    ? {
        publishable: createApiKeyHref(`${base}/keys`, 'publishable', environment?.id),
        secret: createApiKeyHref(`${base}/keys`, 'secret', environment?.id),
      }
    : null;

  return (
    <div className="container mx-auto flex max-w-5xl flex-col gap-6 py-8">
      <PageHero
        icon={ShieldCheck}
        eyebrow={project.name}
        title={t('title')}
        description={t('description')}
      />

      <ChartCard
        title={t('keysTitle', { environment: environment?.name ?? '' })}
        description={t('keysDescription')}
        icon={KeyRound}
      >
        <div className="grid gap-3 md:grid-cols-2" data-testid="installation-keys">
          {(['publishable', 'secret'] as const).map((kind) => {
            const list = kind === 'publishable' ? browserKeys : serverKeys;
            return (
              <div
                key={kind}
                className="flex flex-col gap-1.5 rounded-xl border border-border p-3 text-sm"
              >
                <span className="font-semibold">{t(`keyKinds.${kind}`)}</span>
                {list.length === 0 ? (
                  <>
                    <span className="text-xs text-warning">{t(`noKey.${kind}`)}</span>
                    {createKeyHref ? (
                      <Link
                        href={createKeyHref[kind]}
                        className="text-xs font-medium text-primary hover:underline"
                      >
                        {t(`createKey.${kind}`)}
                      </Link>
                    ) : null}
                  </>
                ) : (
                  list.map((key) => (
                    <span key={key.id} className="flex flex-col text-xs">
                      <code className="font-mono" dir="ltr">
                        {key.keyPrefix}... ({key.name})
                      </code>
                      {kind === 'publishable' ? (
                        <span className="text-muted-foreground" dir="ltr">
                          {key.allowedOrigins.join(', ')}
                        </span>
                      ) : null}
                    </span>
                  ))
                )}
              </div>
            );
          })}
        </div>
        {canManageKeys ? (
          <Link
            href={`${base}/keys`}
            className="mt-3 inline-block text-sm font-medium text-primary hover:underline"
          >
            {t('manageKeys')}
          </Link>
        ) : null}
      </ChartCard>

      <ChartCard title={t('codeTitle')} description={t('codeDescription')} icon={Code2}>
        <InstallationCode
          apiBase={apiBase}
          browserKeyPrefix={browserKeys[0]?.keyPrefix ?? null}
          serverKeyPrefix={serverKeys[0]?.keyPrefix ?? null}
          environmentName={environment?.name ?? null}
          createKeyHref={createKeyHref}
        />
      </ChartCard>

      <ChartCard title={t('checkTitle')} description={t('checkDescription')} icon={Radio}>
        {environment ? (
          <InstallationCheck
            orgId={orgId}
            projectId={projectId}
            environmentId={environment.id}
            environmentName={environment.name}
            defaultExpected={defaultExpected}
            initialReport={initial.report}
          />
        ) : (
          <p className="text-sm text-muted-foreground">{t('noEnvironment')}</p>
        )}
      </ChartCard>
    </div>
  );
}
