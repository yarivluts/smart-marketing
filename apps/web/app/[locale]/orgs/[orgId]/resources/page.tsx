import { notFound, redirect } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { can } from '@growthos/shared';
import { OrgShell } from '@/components/orgs/org-shell';
import { getServerSession } from '@/lib/auth/get-server-session';
import { resolveOrgSessionContext } from '@/lib/orgs/session-context';
import { findActiveMembership } from '@/lib/orgs/access';
import {
  listOrgPeople,
  listOrgProjects,
  listPendingAttachmentsForOrgWithDetails,
  listResourceTemplates,
  listSharedCredentials,
} from '@/lib/orgs/queries';
import { CreateCredentialForm } from '@/components/orgs/create-credential-form';
import { CreateTemplateForm } from '@/components/orgs/create-template-form';
import { CreatePersonForm } from '@/components/orgs/create-person-form';
import { PendingAttachmentRequests } from '@/components/orgs/pending-attachment-requests';
import { SetCredentialSecretForm } from '@/components/orgs/set-credential-secret-form';
import { PushAttachmentForm } from '@/components/orgs/push-attachment-form';

type PageProps = Readonly<{
  params: Promise<{ locale: string; orgId: string }>;
}>;

export async function generateMetadata({ params }: PageProps) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'ResourceLibrary' });
  return { title: t('title') };
}

/**
 * The Org Resource Library (KAN-27, plan 08 §1.2): shared connection
 * credentials, templates, and the people registry. Any active member can
 * browse it (to pick something to request attaching to their project);
 * creating library resources and deciding pending attachment requests both
 * require `resources.manage` — a visitor who isn't an active member gets a
 * 404, matching the KAN-26 non-enumeration principle applied elsewhere.
 */
export default async function ResourceLibraryPage({
  params,
}: PageProps): Promise<React.ReactElement> {
  const { locale, orgId } = await params;
  setRequestLocale(locale);

  const session = await getServerSession();
  if (!session) {
    redirect(`/${locale}/login?from=%2Forgs%2F${orgId}%2Fresources`);
  }

  const { user, memberships, bindings } = await resolveOrgSessionContext(session);
  const membership = findActiveMembership(memberships, orgId);
  if (!membership) {
    notFound();
  }

  const canManageResources = can(bindings, { type: 'user', id: user.id }, 'resources.manage', {
    orgId,
  });

  const [credentials, templates, people, pendingRequests, projects] = await Promise.all([
    listSharedCredentials(orgId),
    listResourceTemplates(orgId),
    listOrgPeople(orgId),
    canManageResources ? listPendingAttachmentsForOrgWithDetails(orgId) : Promise.resolve([]),
    canManageResources ? listOrgProjects(orgId) : Promise.resolve([]),
  ]);
  const pushTargets = projects.map((project) => ({ id: project.id, name: project.name }));

  const t = await getTranslations('ResourceLibrary');

  return (
    <OrgShell locale={locale} orgId={orgId}>
      <main className="container mx-auto flex max-w-3xl flex-col gap-8 py-16">
        <h1 className="text-3xl font-bold tracking-tight">{t('title')}</h1>

        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold">{t('credentialsHeading')}</h2>
          {credentials.length === 0 ? (
            <p className="text-muted-foreground">{t('noCredentials')}</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {credentials.map((credential) => (
                <li
                  key={credential.id}
                  className="flex flex-col gap-2 rounded-md border border-input px-3 py-2 text-sm"
                >
                  {t('credentialSummary', {
                    name: credential.name,
                    provider: credential.provider,
                    scopeCount: credential.available_scopes?.length ?? 0,
                  })}
                  {canManageResources ? (
                    <SetCredentialSecretForm
                      orgId={orgId}
                      credentialId={credential.id}
                      hasSecret={Boolean(credential.encrypted_secret)}
                    />
                  ) : null}
                  {canManageResources ? (
                    <PushAttachmentForm
                      orgId={orgId}
                      resourceKind="credential"
                      resourceId={credential.id}
                      projects={pushTargets}
                      availableScopes={credential.available_scopes}
                    />
                  ) : null}
                </li>
              ))}
            </ul>
          )}
          {canManageResources ? <CreateCredentialForm orgId={orgId} /> : null}
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold">{t('templatesHeading')}</h2>
          {templates.length === 0 ? (
            <p className="text-muted-foreground">{t('noTemplates')}</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {templates.map((template) => (
                <li
                  key={template.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-input px-3 py-2 text-sm"
                >
                  <span>
                    {t('templateSummary', {
                      name: template.name,
                      type: template.type,
                      version: template.version,
                    })}
                  </span>
                  {canManageResources ? (
                    <PushAttachmentForm orgId={orgId} resourceKind="template" resourceId={template.id} projects={pushTargets} />
                  ) : null}
                </li>
              ))}
            </ul>
          )}
          {canManageResources ? <CreateTemplateForm orgId={orgId} /> : null}
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold">{t('peopleHeading')}</h2>
          {people.length === 0 ? (
            <p className="text-muted-foreground">{t('noPeople')}</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {people.map((person) => (
                <li
                  key={person.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-input px-3 py-2 text-sm"
                >
                  <span>{person.title ? `${person.name} — ${person.title}` : person.name}</span>
                  {canManageResources ? (
                    <PushAttachmentForm orgId={orgId} resourceKind="person" resourceId={person.id} projects={pushTargets} />
                  ) : null}
                </li>
              ))}
            </ul>
          )}
          {canManageResources ? <CreatePersonForm orgId={orgId} /> : null}
        </section>

        {canManageResources ? (
          <section className="flex flex-col gap-3">
            <h2 className="text-lg font-semibold">{t('pendingRequestsHeading')}</h2>
            <PendingAttachmentRequests orgId={orgId} requests={pendingRequests} />
          </section>
        ) : null}
      </main>
    </OrgShell>
  );
}
