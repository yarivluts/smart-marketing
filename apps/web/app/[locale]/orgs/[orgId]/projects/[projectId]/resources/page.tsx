import { notFound, redirect } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { can } from '@growthos/shared';
import type { ResourceAttachmentModel, ResourceKind } from '@growthos/firebase-orm-models';
import { CheckCircle2, Clock, FileStack, FolderOpen, KeyRound, Library, PieChart, Users, Workflow } from 'lucide-react';
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
import { StatCard } from '@/components/ui/stat-card';
import { ChartCard } from '@/components/viz/chart-card';
import { DonutChart } from '@/components/viz/donut-chart';
import { EmptyState } from '@/components/viz/empty-state';
import { FlowDiagram } from '@/components/viz/flow-diagram';
import { InitialsAvatar } from '@/components/viz/initials-avatar';
import { PageHero } from '@/components/viz/page-hero';
import { cn } from '@/lib/utils';

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
    notFound();
  }

  const principal = { type: 'user' as const, id: user.id };
  const canRequest = can(bindings, principal, 'project.manage', { orgId, projectId });
  const canDetach = can(bindings, principal, 'resources.manage', { orgId, projectId });

  const [credentials, templates, people, attachments] = await Promise.all([
    listSharedCredentials(orgId),
    listResourceTemplates(orgId),
    listOrgPeople(orgId),
    listAttachmentsForProject(orgId, projectId),
  ]);

  const t = await getTranslations('ProjectResources');
  const numberFormat = new Intl.NumberFormat(locale);

  // Every library resource this project could see, with where it stands for this project.
  const library = [
    ...credentials.map((resource) => ({ id: resource.id, archived: Boolean(resource.archived_at) })),
    ...templates.map((resource) => ({ id: resource.id, archived: Boolean(resource.archived_at) })),
    ...people.map((resource) => ({ id: resource.id, archived: Boolean(resource.archived_at) })),
  ];
  const standing = library.map((resource) => ({ ...resource, attachment: findAttachment(attachments, resource.id) }));
  const approvedCount = standing.filter((entry) => entry.attachment?.status === 'approved').length;
  const pendingCount = standing.filter((entry) => entry.attachment?.status === 'pending').length;
  const availableCount = standing.filter((entry) => !entry.attachment && !entry.archived).length;
  const libraryCount = library.filter((resource) => !resource.archived).length;
  const orgResourcesHref = `/orgs/${orgId}/resources`;

  function renderRow(
    resourceKind: ResourceKind,
    resourceId: string,
    label: string,
    archived: boolean,
    availableScopes?: readonly string[],
  ) {
    const attachment = findAttachment(attachments, resourceId);
    // An archived resource (KAN-129) with nothing already attached has nothing useful to show a
    // project here — it can no longer be requested, and there's no existing attachment to manage.
    if (archived && !attachment) {
      return null;
    }
    return (
      <li key={resourceId} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-background/60 p-3 text-sm">
        <span className="flex min-w-0 items-center gap-3">
          {resourceKind === 'person' ? (
            <InitialsAvatar name={label} seed={resourceId} size="sm" />
          ) : (
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              {resourceKind === 'credential' ? <KeyRound className="h-3.5 w-3.5" aria-hidden="true" /> : <FileStack className="h-3.5 w-3.5" aria-hidden="true" />}
            </span>
          )}
          <span className="truncate font-medium">{label}</span>
        </span>
        {attachment ? (
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium',
                attachment.status === 'approved' ? 'bg-success/10 text-success' : 'bg-warning/10 text-warning',
              )}
            >
              {attachment.status === 'approved' ? <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" /> : <Clock className="h-3.5 w-3.5" aria-hidden="true" />}
              <span>
                {t('statusLabel', { status: attachment.status })}
                {attachment.scope_selection && attachment.scope_selection.length > 0
                  ? ` (${attachment.scope_selection.join(', ')})`
                  : ''}
              </span>
            </span>
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
    <main className="container mx-auto flex max-w-6xl flex-col gap-6 py-10">
      <PageHero icon={FolderOpen} eyebrow={t('eyebrow')} title={t('title', { projectName: project.name })} description={t('heroDescription')}>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard title={t('kpiAttached')} value={numberFormat.format(approvedCount)} icon={CheckCircle2} />
          <StatCard title={t('kpiPending')} value={numberFormat.format(pendingCount)} icon={Clock} />
          <StatCard title={t('kpiAvailable')} value={numberFormat.format(availableCount)} icon={Library} />
          <StatCard
            title={t('kpiCoverage')}
            value={libraryCount > 0 ? `${Math.round((approvedCount / libraryCount) * 100)}%` : '-'}
            icon={PieChart}
            progress={libraryCount > 0 ? Math.round((approvedCount / libraryCount) * 100) : undefined}
            subtext={t('kpiCoverageSubtext', { count: libraryCount })}
          />
        </div>
      </PageHero>

      {libraryCount > 0 || approvedCount + pendingCount > 0 ? (
        <div className="grid gap-6 lg:grid-cols-3">
          <ChartCard className="lg:col-span-2" title={t('flowTitle')} description={t('flowDescription')} icon={Workflow}>
            <FlowDiagram
              label={t('flowTitle')}
              height={220}
              nodes={[
                { id: 'library', label: t('flowLibrary'), value: numberFormat.format(libraryCount), sublabel: t('flowLibrarySub'), status: libraryCount > 0 ? 'ok' : 'idle', href: orgResourcesHref },
                { id: 'available', label: t('flowAvailable'), value: numberFormat.format(availableCount), sublabel: t('flowAvailableSub'), status: 'idle' },
                { id: 'pending', label: t('flowPending'), value: numberFormat.format(pendingCount), sublabel: t('flowPendingSub'), status: pendingCount > 0 ? 'warn' : 'idle', href: orgResourcesHref },
                { id: 'attached', label: t('flowAttached'), value: numberFormat.format(approvedCount), sublabel: t('flowAttachedSub'), status: approvedCount > 0 ? 'ok' : 'idle' },
              ]}
              edges={[
                { source: 'library', target: 'available', status: 'idle' },
                { source: 'library', target: 'pending', label: t('flowEdgeRequested'), status: pendingCount > 0 ? 'warn' : 'idle', animated: pendingCount > 0 },
                { source: 'pending', target: 'attached', label: t('flowEdgeApproved'), status: approvedCount > 0 ? 'ok' : 'idle' },
              ]}
            />
          </ChartCard>
          <ChartCard title={t('mixTitle')} description={t('mixDescription')} icon={PieChart}>
            <DonutChart
              label={t('mixTitle')}
              centerValue={numberFormat.format(approvedCount + pendingCount + availableCount)}
              centerLabel={t('mixCenter')}
              data={[
                { label: t('mixAttached'), value: approvedCount, color: 'hsl(var(--success))' },
                { label: t('mixPending'), value: pendingCount, color: 'hsl(var(--warning))' },
                { label: t('mixAvailable'), value: availableCount, color: 'hsl(var(--muted-foreground))' },
              ]}
              size={140}
              layout="stacked"
            />
          </ChartCard>
        </div>
      ) : null}

      <ChartCard title={t('credentialsHeading')} icon={KeyRound}>
        {credentials.length === 0 ? (
          <EmptyState compact icon={KeyRound} title={t('noCredentials')} />
        ) : (
          <ul className="flex flex-col gap-2">
            {credentials.map((credential) =>
              renderRow('credential', credential.id, credential.name, Boolean(credential.archived_at), credential.available_scopes),
            )}
          </ul>
        )}
      </ChartCard>

      <div className="grid gap-6 lg:grid-cols-2">
        <ChartCard title={t('templatesHeading')} icon={FileStack}>
          {templates.length === 0 ? (
            <EmptyState compact icon={FileStack} title={t('noTemplates')} />
          ) : (
            <ul className="flex flex-col gap-2">{templates.map((template) => renderRow('template', template.id, template.name, Boolean(template.archived_at)))}</ul>
          )}
        </ChartCard>

        <ChartCard title={t('peopleHeading')} icon={Users}>
          {people.length === 0 ? (
            <EmptyState compact icon={Users} title={t('noPeople')} />
          ) : (
            <ul className="flex flex-col gap-2">{people.map((person) => renderRow('person', person.id, person.name, Boolean(person.archived_at)))}</ul>
          )}
        </ChartCard>
      </div>
    </main>
  );
}
