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
import { EditCredentialForm } from '@/components/orgs/edit-credential-form';
import { EditPersonForm } from '@/components/orgs/edit-person-form';
import { EditTemplateForm } from '@/components/orgs/edit-template-form';
import { PendingAttachmentRequests } from '@/components/orgs/pending-attachment-requests';
import { SetCredentialSecretForm } from '@/components/orgs/set-credential-secret-form';
import { PushAttachmentForm } from '@/components/orgs/push-attachment-form';
import { ArchiveToggleButton } from '@/components/orgs/archive-toggle-button';

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
                  <span>
                    {t('credentialSummary', {
                      name: credential.name,
                      provider: credential.provider,
                      scopeCount: credential.available_scopes?.length ?? 0,
                    })}
                    {credential.archived_at ? (
                      <span className="ms-2 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                        {t('archivedBadge')}
                      </span>
                    ) : null}
                  </span>
                  {canManageResources ? (
                    <EditCredentialForm
                      orgId={orgId}
                      credentialId={credential.id}
                      initialName={credential.name}
                      initialAvailableScopes={credential.available_scopes ?? []}
                    />
                  ) : null}
                  {canManageResources ? (
                    <SetCredentialSecretForm
                      orgId={orgId}
                      credentialId={credential.id}
                      hasSecret={Boolean(credential.encrypted_secret)}
                    />
                  ) : null}
                  {canManageResources ? (
                    <ArchiveToggleButton
                      archivePath={`/api/orgs/${orgId}/resources/credentials/${credential.id}`}
                      unarchivePath={`/api/orgs/${orgId}/resources/credentials/${credential.id}/unarchive`}
                      archived={Boolean(credential.archived_at)}
                      archiveLabel={t('archive')}
                      unarchiveLabel={t('unarchive')}
                      errorLabel={credential.archived_at ? t('unarchiveError') : t('archiveError')}
                    />
                  ) : null}
                  {canManageResources && !credential.archived_at ? (
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
                    {template.archived_at ? (
                      <span className="ms-2 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                        {t('archivedBadge')}
                      </span>
                    ) : null}
                  </span>
                  {canManageResources ? (
                    <div className="flex w-full flex-wrap items-center gap-2">
                      <EditTemplateForm
                        orgId={orgId}
                        templateId={template.id}
                        initialName={template.name}
                        initialConfig={template.config}
                      />
                      <ArchiveToggleButton
                        archivePath={`/api/orgs/${orgId}/resources/templates/${template.id}`}
                        unarchivePath={`/api/orgs/${orgId}/resources/templates/${template.id}/unarchive`}
                        archived={Boolean(template.archived_at)}
                        archiveLabel={t('archive')}
                        unarchiveLabel={t('unarchive')}
                        errorLabel={template.archived_at ? t('unarchiveError') : t('archiveError')}
                      />
                      {!template.archived_at ? (
                        <PushAttachmentForm orgId={orgId} resourceKind="template" resourceId={template.id} projects={pushTargets} />
                      ) : null}
                    </div>
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
                  <span>
                    {person.title ? `${person.name} — ${person.title}` : person.name}
                    {person.archived_at ? (
                      <span className="ms-2 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                        {t('archivedBadge')}
                      </span>
                    ) : null}
                  </span>
                  {canManageResources ? (
                    <div className="flex flex-wrap items-center gap-2">
                      <EditPersonForm
                        orgId={orgId}
                        personId={person.id}
                        initialName={person.name}
                        initialEmail={person.email}
                        initialTitle={person.title}
                        initialPhotoUrl={person.photo_url}
                      />
                      <ArchiveToggleButton
                        archivePath={`/api/orgs/${orgId}/resources/people/${person.id}`}
                        unarchivePath={`/api/orgs/${orgId}/resources/people/${person.id}/unarchive`}
                        archived={Boolean(person.archived_at)}
                        archiveLabel={t('archive')}
                        unarchiveLabel={t('unarchive')}
                        errorLabel={person.archived_at ? t('unarchiveError') : t('archiveError')}
                      />
                      {!person.archived_at ? (
                        <PushAttachmentForm orgId={orgId} resourceKind="person" resourceId={person.id} projects={pushTargets} />
                      ) : null}
                    </div>
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
