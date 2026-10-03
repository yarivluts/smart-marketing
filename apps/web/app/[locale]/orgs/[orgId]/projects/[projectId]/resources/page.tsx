import { notFound, redirect } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { can } from '@growthos/shared';
import type { ResourceAttachmentModel, ResourceKind } from '@growthos/firebase-orm-models';
import { KeyRound, FileCode, Users } from 'lucide-react';
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
  listAttachmentsForProject,
  listOrgPeople,
  listOrgProjects,
  listResourceTemplates,
  listSharedCredentials,
} from '@/lib/orgs/queries';
import { RequestAttachmentForm } from '@/components/orgs/request-attachment-form';
import { DetachAttachmentButton } from '@/components/orgs/detach-attachment-button';
import { WriteTierSelector } from '@/components/orgs/write-tier-selector';

type PageProps = Readonly<{
  params: Promise<{ locale: string; orgId: string; projectId: string }>;
}>;

export async function generateMetadata({ params }: PageProps) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'ProjectResources' });
  return { title: t('metaTitle') };
}

function findAttachment(
  attachments: ResourceAttachmentModel[],
  resourceId: string,
): ResourceAttachmentModel | undefined {
  return attachments.find(
    (attachment) => attachment.resource_id === resourceId && (attachment.status === 'pending' || attachment.status === 'approved'),
  );
}

/**
 * A project's view into the org's Resource Library (KAN-27): request
 * attaching a shared credential/template/person, see this project's current
 * attachments, and detach one. Requesting requires `project.manage` (the
 * "project-admin initiated" half of plan 08 §1.2); detaching requires
 * `resources.manage` (the org-resource-owner side) — a project admin who
 * wants to drop a resource asks the org, matching the same asymmetry KAN-27's
 * API routes enforce.
 */
export default async function ProjectResourcesPage({ params }: PageProps): Promise<React.ReactElement> {
  const { locale, orgId, projectId } = await params;
  setRequestLocale(locale);

  const session = await getServerSession();
  if (!session) {
    redirect(`/${locale}/login?from=%2Forgs%2F${orgId}%2Fprojects%2F${projectId}%2Fresources`);
  }

  const { user, memberships, bindings } = await resolveOrgSessionContext(session);
  const membership = findActiveMembership(memberships, orgId);
  if (!membership) {
    notFound();
  }

  const projects = await listOrgProjects(orgId);
  const project = projects.find((candidate) => candidate.id === projectId);
  if (!project) {
    if (projects.length > 0) {
      redirect(`/${locale}/orgs/${orgId}/projects/${projects[0].id}/resources`);
    }
    redirect(`/${locale}/orgs/${orgId}`);
  }

  const principal = { type: 'user' as const, id: user.id };
  const canRequest = can(bindings, principal, 'project.manage', { orgId });
  const canDetach = can(bindings, principal, 'resources.manage', { orgId });

  const [credentials, templates, people, attachments] = await Promise.all([
    listSharedCredentials(orgId),
    listResourceTemplates(orgId),
    listOrgPeople(orgId),
    listAttachmentsForProject(orgId, projectId),
  ]);

  const t = await getTranslations('ProjectResources');

  function renderRow(
    resourceKind: ResourceKind,
    resourceId: string,
    label: string,
    archived: boolean,
    availableScopes?: readonly string[],
  ) {
    const attachment = findAttachment(attachments, resourceId);
    if (archived && !attachment) {
      return null;
    }
    return (
      <li
        key={resourceId}
        className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-2xl bg-pp-surface-container-low p-4 text-sm"
      >
        <span className="font-semibold text-pp-on-surface">{label}</span>
        {attachment ? (
          <div className="flex flex-wrap items-center gap-2">
            <PpPill accent={attachment.status === 'approved' ? 'mint' : 'sky'} dot>
              {t('statusLabel', { status: attachment.status })}
              {attachment.scope_selection && attachment.scope_selection.length > 0
                ? ` (${attachment.scope_selection.join(', ')})`
                : ''}
            </PpPill>
            {resourceKind === 'credential' && attachment.status === 'approved' ? (
              <WriteTierSelector orgId={orgId} attachmentId={attachment.id} tier={attachment.write_tier} disabled={!canDetach} />
            ) : null}
            {attachment.status === 'approved' && canDetach ? (
              <DetachAttachmentButton orgId={orgId} attachmentId={attachment.id} />
            ) : null}
          </div>
        ) : canRequest ? (
          <RequestAttachmentForm
            orgId={orgId}
            projectId={projectId}
            resourceKind={resourceKind}
            resourceId={resourceId}
            availableScopes={availableScopes}
          />
        ) : null}
      </li>
    );
  }

  return (
    <PpPage>
      <PpPageHeader
        eyebrow={t('eyebrow')}
        title={t('title', { projectName: project.name })}
        description={t('description')}
      />

      {/* 1. Attached Credentials */}
      <PpCard
        title={t('credentialsHeading')}
        icon={KeyRound}
        iconAccent="primary"
      >
        {credentials.length === 0 ? (
          <p className="text-pp-body-md text-pp-on-surface-variant">{t('noCredentials')}</p>
        ) : (
          <ul className="space-y-3">
            {credentials.map((credential) =>
              renderRow('credential', credential.id, credential.name, Boolean(credential.archived_at), credential.available_scopes),
            )}
          </ul>
        )}
      </PpCard>

      {/* 2. Attached Templates */}
      <PpCard
        title={t('templatesHeading')}
        icon={FileCode}
        iconAccent="sky"
      >
        {templates.length === 0 ? (
          <p className="text-pp-body-md text-pp-on-surface-variant">{t('noTemplates')}</p>
        ) : (
          <ul className="space-y-3">
            {templates.map((template) => renderRow('template', template.id, template.name, Boolean(template.archived_at)))}
          </ul>
        )}
      </PpCard>

      {/* 3. Team Member Assignments */}
      <PpCard
        title={t('peopleHeading')}
        icon={Users}
        iconAccent="pink"
      >
        {people.length === 0 ? (
          <p className="text-pp-body-md text-pp-on-surface-variant">{t('noPeople')}</p>
        ) : (
          <ul className="space-y-3">
            {people.map((person) => renderRow('person', person.id, person.name, Boolean(person.archived_at)))}
          </ul>
        )}
      </PpCard>
    </PpPage>
  );
}
