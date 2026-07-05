import { notFound, redirect } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { can } from '@growthos/shared';
import type { ResourceAttachmentModel } from '@growthos/firebase-orm-models';
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

type PageProps = Readonly<{
  params: Promise<{ locale: string; orgId: string; projectId: string }>;
}>;

export async function generateMetadata({ params }: PageProps) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'ProjectResources' });
  return { title: t('title') };
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
    notFound();
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

  function renderRow(resourceKind: 'credential' | 'template' | 'person', resourceId: string, label: string, availableScopes?: readonly string[]) {
    const attachment = findAttachment(attachments, resourceId);
    return (
      <li key={resourceId} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-input px-3 py-2 text-sm">
        <span>{label}</span>
        {attachment ? (
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">
              {t('statusLabel', { status: attachment.status })}
              {attachment.scope_selection && attachment.scope_selection.length > 0
                ? ` (${attachment.scope_selection.join(', ')})`
                : ''}
            </span>
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
    <main className="container mx-auto flex max-w-3xl flex-col gap-8 py-16">
      <h1 className="text-3xl font-bold tracking-tight">{t('title', { projectName: project.name })}</h1>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">{t('credentialsHeading')}</h2>
        {credentials.length === 0 ? (
          <p className="text-muted-foreground">{t('noCredentials')}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {credentials.map((credential) =>
              renderRow('credential', credential.id, credential.name, credential.available_scopes),
            )}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">{t('templatesHeading')}</h2>
        {templates.length === 0 ? (
          <p className="text-muted-foreground">{t('noTemplates')}</p>
        ) : (
          <ul className="flex flex-col gap-2">{templates.map((template) => renderRow('template', template.id, template.name))}</ul>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">{t('peopleHeading')}</h2>
        {people.length === 0 ? (
          <p className="text-muted-foreground">{t('noPeople')}</p>
        ) : (
          <ul className="flex flex-col gap-2">{people.map((person) => renderRow('person', person.id, person.name))}</ul>
        )}
      </section>
    </main>
  );
}
