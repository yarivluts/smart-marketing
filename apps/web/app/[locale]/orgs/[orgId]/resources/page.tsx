import { notFound, redirect } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { can } from '@growthos/shared';
import { KeyRound, FileCode, Users, Clock } from 'lucide-react';
import { OrgShell } from '@/components/orgs/org-shell';
import {
  PpPage,
  PpPageHeader,
  PpCard,
  PpPill,
} from '@/components/pastel/primitives';
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
      <PpPage>
        <PpPageHeader
          eyebrow={t('eyebrow')}
          title={t('title')}
          description={t('description')}
        />

        {/* 1. Shared Credentials Section */}
        <PpCard
          title={t('credentialsHeading')}
          icon={KeyRound}
          iconAccent="primary"
        >
          <div className="space-y-4">
            {credentials.length === 0 ? (
              <p className="text-pp-body-md text-pp-on-surface-variant">{t('noCredentials')}</p>
            ) : (
              <ul className="space-y-3">
                {credentials.map((credential) => (
                  <li
                    key={credential.id}
                    className="flex flex-col gap-2 rounded-2xl bg-pp-surface-container-low p-4 text-sm"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-semibold text-pp-on-surface">
                        {t('credentialSummary', {
                          name: credential.name,
                          provider: credential.provider,
                          scopeCount: credential.available_scopes?.length ?? 0,
                        })}
                      </span>
                      {credential.archived_at ? (
                        <PpPill accent="amber">
                          {t('archivedBadge')}
                        </PpPill>
                      ) : null}
                    </div>
                    {canManageResources ? (
                      <div className="flex flex-col gap-2 pt-2 border-t border-pp-surface-container">
                        <EditCredentialForm
                          orgId={orgId}
                          credentialId={credential.id}
                          initialName={credential.name}
                          initialAvailableScopes={credential.available_scopes ?? []}
                        />
                        <SetCredentialSecretForm
                          orgId={orgId}
                          credentialId={credential.id}
                          hasSecret={Boolean(credential.encrypted_secret)}
                        />
                        <div className="flex flex-wrap items-center gap-2">
                          <ArchiveToggleButton
                            archivePath={`/api/orgs/${orgId}/resources/credentials/${credential.id}`}
                            unarchivePath={`/api/orgs/${orgId}/resources/credentials/${credential.id}/unarchive`}
                            archived={Boolean(credential.archived_at)}
                            archiveLabel={t('archive')}
                            unarchiveLabel={t('unarchive')}
                            errorLabel={credential.archived_at ? t('unarchiveError') : t('archiveError')}
                          />
                        </div>
                        {!credential.archived_at ? (
                          <PushAttachmentForm
                            orgId={orgId}
                            resourceKind="credential"
                            resourceId={credential.id}
                            projects={pushTargets}
                            availableScopes={credential.available_scopes}
                          />
                        ) : null}
                      </div>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
            {canManageResources ? (
              <div className="pt-2 border-t border-pp-surface-container">
                <CreateCredentialForm orgId={orgId} />
              </div>
            ) : null}
          </div>
        </PpCard>

        {/* 2. Resource Templates Section */}
        <PpCard
          title={t('templatesHeading')}
          icon={FileCode}
          iconAccent="sky"
        >
          <div className="space-y-4">
            {templates.length === 0 ? (
              <p className="text-pp-body-md text-pp-on-surface-variant">{t('noTemplates')}</p>
            ) : (
              <ul className="space-y-3">
                {templates.map((template) => (
                  <li
                    key={template.id}
                    className="flex flex-col gap-2 rounded-2xl bg-pp-surface-container-low p-4 text-sm"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-semibold text-pp-on-surface">
                        {t('templateSummary', {
                          name: template.name,
                          type: template.type,
                          version: template.version,
                        })}
                      </span>
                      {template.archived_at ? (
                        <PpPill accent="amber">
                          {t('archivedBadge')}
                        </PpPill>
                      ) : null}
                    </div>
                    {canManageResources ? (
                      <div className="flex flex-col gap-2 pt-2 border-t border-pp-surface-container">
                        <EditTemplateForm
                          orgId={orgId}
                          templateId={template.id}
                          initialName={template.name}
                          initialConfig={template.config}
                        />
                        <div className="flex flex-wrap items-center gap-2">
                          <ArchiveToggleButton
                            archivePath={`/api/orgs/${orgId}/resources/templates/${template.id}`}
                            unarchivePath={`/api/orgs/${orgId}/resources/templates/${template.id}/unarchive`}
                            archived={Boolean(template.archived_at)}
                            archiveLabel={t('archive')}
                            unarchiveLabel={t('unarchive')}
                            errorLabel={template.archived_at ? t('unarchiveError') : t('archiveError')}
                          />
                        </div>
                        {!template.archived_at ? (
                          <PushAttachmentForm orgId={orgId} resourceKind="template" resourceId={template.id} projects={pushTargets} />
                        ) : null}
                      </div>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
            {canManageResources ? (
              <div className="pt-2 border-t border-pp-surface-container">
                <CreateTemplateForm orgId={orgId} />
              </div>
            ) : null}
          </div>
        </PpCard>

        {/* 3. People Directory Section */}
        <PpCard
          title={t('peopleHeading')}
          icon={Users}
          iconAccent="pink"
        >
          <div className="space-y-4">
            {people.length === 0 ? (
              <p className="text-pp-body-md text-pp-on-surface-variant">{t('noPeople')}</p>
            ) : (
              <ul className="space-y-3">
                {people.map((person) => (
                  <li
                    key={person.id}
                    className="flex flex-col gap-2 rounded-2xl bg-pp-surface-container-low p-4 text-sm"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-semibold text-pp-on-surface">
                        {person.title ? `${person.name} — ${person.title}` : person.name}
                      </span>
                      {person.archived_at ? (
                        <PpPill accent="amber">
                          {t('archivedBadge')}
                        </PpPill>
                      ) : null}
                    </div>
                    {canManageResources ? (
                      <div className="flex flex-col gap-2 pt-2 border-t border-pp-surface-container">
                        <EditPersonForm
                          orgId={orgId}
                          personId={person.id}
                          initialName={person.name}
                          initialEmail={person.email}
                          initialTitle={person.title}
                          initialPhotoUrl={person.photo_url}
                        />
                        <div className="flex flex-wrap items-center gap-2">
                          <ArchiveToggleButton
                            archivePath={`/api/orgs/${orgId}/resources/people/${person.id}`}
                            unarchivePath={`/api/orgs/${orgId}/resources/people/${person.id}/unarchive`}
                            archived={Boolean(person.archived_at)}
                            archiveLabel={t('archive')}
                            unarchiveLabel={t('unarchive')}
                            errorLabel={person.archived_at ? t('unarchiveError') : t('archiveError')}
                          />
                        </div>
                        {!person.archived_at ? (
                          <PushAttachmentForm orgId={orgId} resourceKind="person" resourceId={person.id} projects={pushTargets} />
                        ) : null}
                      </div>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
            {canManageResources ? (
              <div className="pt-2 border-t border-pp-surface-container">
                <CreatePersonForm orgId={orgId} />
              </div>
            ) : null}
          </div>
        </PpCard>

        {/* 4. Pending Attachment Requests Section */}
        {canManageResources ? (
          <PpCard
            title={t('pendingRequestsHeading')}
            icon={Clock}
            iconAccent="amber"
          >
            <PendingAttachmentRequests orgId={orgId} requests={pendingRequests} />
          </PpCard>
        ) : null}
      </PpPage>
    </OrgShell>
  );
}
