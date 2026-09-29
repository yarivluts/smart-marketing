import { notFound, redirect } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { can } from '@growthos/shared';
import { Archive, FileStack, FolderOpen, Inbox, KeyRound, PieChart, Plug, Users } from 'lucide-react';
import { OrgShell } from '@/components/orgs/org-shell';
import { StatCard } from '@/components/ui/stat-card';
import { BarList } from '@/components/viz/bar-list';
import { ChartCard } from '@/components/viz/chart-card';
import { DonutChart } from '@/components/viz/donut-chart';
import { EmptyState } from '@/components/viz/empty-state';
import { InitialsAvatar } from '@/components/viz/initials-avatar';
import { PageHero } from '@/components/viz/page-hero';
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
import { topCounts } from '@/lib/orgs/workspace-view';
import { CreateCredentialForm } from '@/components/orgs/create-credential-form';
import { CreateTemplateForm } from '@/components/orgs/create-template-form';
import { CreatePersonForm } from '@/components/orgs/create-person-form';
import { EditCredentialForm } from '@/components/orgs/edit-credential-form';
import { EditPersonForm } from '@/components/orgs/edit-person-form';
import { EditTemplateForm } from '@/components/orgs/edit-template-form';
import { PendingAttachmentRequests } from '@/components/orgs/pending-attachment-requests';
import { describeSecretKeyState } from '@/lib/vault/kms-provider';
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

function ArchivedBadge({ label }: { label: string }): React.ReactElement {
  return <span className="ms-2 inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">{label}</span>;
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
  const numberFormat = new Intl.NumberFormat(locale);

  const liveCredentials = credentials.filter((credential) => !credential.archived_at);
  const liveTemplates = templates.filter((template) => !template.archived_at);
  const livePeople = people.filter((person) => !person.archived_at);
  const archivedCount = credentials.length + templates.length + people.length - liveCredentials.length - liveTemplates.length - livePeople.length;
  const withSecret = liveCredentials.filter((credential) => Boolean(credential.encrypted_secret)).length;
  const providers = topCounts(liveCredentials.map((credential) => credential.provider));
  const libraryTotal = liveCredentials.length + liveTemplates.length + livePeople.length;

  return (
    <OrgShell locale={locale} orgId={orgId}>
      <main className="container mx-auto flex max-w-6xl flex-col gap-6 py-10">
        <PageHero icon={FolderOpen} eyebrow={t('eyebrow')} title={t('title')} description={t('heroDescription')}>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard
              title={t('kpiCredentials')}
              value={numberFormat.format(liveCredentials.length)}
              icon={KeyRound}
              progress={liveCredentials.length > 0 ? Math.round((withSecret / liveCredentials.length) * 100) : undefined}
              subtext={liveCredentials.length > 0 ? t('kpiCredentialsSubtext', { count: withSecret }) : undefined}
            />
            <StatCard title={t('kpiTemplates')} value={numberFormat.format(liveTemplates.length)} icon={FileStack} />
            <StatCard title={t('kpiPeople')} value={numberFormat.format(livePeople.length)} icon={Users} />
            {canManageResources ? (
              <StatCard title={t('kpiPending')} value={numberFormat.format(pendingRequests.length)} icon={Inbox} />
            ) : (
              <StatCard title={t('kpiArchived')} value={numberFormat.format(archivedCount)} icon={Archive} />
            )}
          </div>
        </PageHero>

        {libraryTotal > 0 ? (
          <div className="grid gap-6 lg:grid-cols-2">
            <ChartCard title={t('mixTitle')} description={t('mixDescription')} icon={PieChart}>
              <DonutChart
                label={t('mixTitle')}
                centerValue={numberFormat.format(libraryTotal)}
                centerLabel={t('mixCenter')}
                data={[
                  { label: t('credentialsHeading'), value: liveCredentials.length },
                  { label: t('templatesHeading'), value: liveTemplates.length },
                  { label: t('peopleHeading'), value: livePeople.length },
                ]}
                size={150}
              />
            </ChartCard>
            <ChartCard title={t('platformsTitle')} description={t('platformsDescription')} icon={Plug}>
              {providers.length === 0 ? (
                <EmptyState compact icon={Plug} title={t('noCredentials')} />
              ) : (
                <BarList items={providers.map((entry) => ({ key: entry.key, label: entry.key, value: entry.count }))} valueFormatter={(value) => numberFormat.format(value)} />
              )}
            </ChartCard>
          </div>
        ) : null}

        {canManageResources ? (
          <ChartCard title={t('pendingRequestsHeading')} icon={Inbox}>
            <PendingAttachmentRequests orgId={orgId} requests={pendingRequests} />
          </ChartCard>
        ) : null}

        <ChartCard title={t('credentialsHeading')} icon={KeyRound}>
          <div className="flex flex-col gap-4">
            {credentials.length === 0 ? (
              <EmptyState compact icon={KeyRound} title={t('noCredentials')} />
            ) : (
              <ul className="flex flex-col gap-3">
                {credentials.map((credential) => (
                  <li key={credential.id} className="flex flex-col gap-2 rounded-xl border border-border bg-background/60 p-4 text-sm">
                    <span className="flex items-center gap-2">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                        <KeyRound className="h-4 w-4" aria-hidden="true" />
                      </span>
                      <span className="font-medium">
                        {t('credentialSummary', {
                          name: credential.name,
                          provider: credential.provider,
                          scopeCount: credential.available_scopes?.length ?? 0,
                        })}
                      </span>
                      {credential.archived_at ? <ArchivedBadge label={t('archivedBadge')} /> : null}
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
                        /* Ciphertext existing is not the same as the secret being
                           readable: a key retired from the ring leaves a stored
                           secret that nothing can decrypt, and "Secret set" said
                           the same thing either way (KAN-173). */
                        secretKeyState={describeSecretKeyState(credential.encrypted_secret)}
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
            {canManageResources ? (
              <div className="flex flex-col gap-3 rounded-xl border border-dashed border-border bg-muted/20 p-4">
                <a href={`/${locale}/orgs/${orgId}/integrations/meta`} className="inline-flex w-fit items-center gap-2 rounded-xl bg-[#1877F2] px-4 py-2 text-sm font-semibold text-white hover:bg-[#166fe0]" data-testid="resource-library-connect-meta">
                  {t('connectMeta')}
                </a>
                <CreateCredentialForm orgId={orgId} />
              </div>
            ) : null}
          </div>
        </ChartCard>

        <div className="grid gap-6 lg:grid-cols-2">
          <ChartCard title={t('templatesHeading')} icon={FileStack}>
            <div className="flex flex-col gap-4">
              {templates.length === 0 ? (
                <EmptyState compact icon={FileStack} title={t('noTemplates')} />
              ) : (
                <ul className="flex flex-col gap-3">
                  {templates.map((template) => (
                    <li key={template.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-background/60 p-3 text-sm">
                      <span className="flex items-center gap-2">
                        <FileStack className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                        <span>
                          {t('templateSummary', {
                            name: template.name,
                            type: template.type,
                            version: template.version,
                          })}
                        </span>
                        {template.archived_at ? <ArchivedBadge label={t('archivedBadge')} /> : null}
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
              {canManageResources ? (
                <div className="rounded-xl border border-dashed border-border bg-muted/20 p-4">
                  <CreateTemplateForm orgId={orgId} />
                </div>
              ) : null}
            </div>
          </ChartCard>

          <ChartCard title={t('peopleHeading')} icon={Users}>
            <div className="flex flex-col gap-4">
              {people.length === 0 ? (
                <EmptyState compact icon={Users} title={t('noPeople')} />
              ) : (
                <ul className="flex flex-col gap-3">
                  {people.map((person) => (
                    <li key={person.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-background/60 p-3 text-sm">
                      <span className="flex items-center gap-3">
                        <InitialsAvatar name={person.name} seed={person.id} size="sm" />
                        <span>
                          {person.title ? `${person.name} — ${person.title}` : person.name}
                          {person.archived_at ? <ArchivedBadge label={t('archivedBadge')} /> : null}
                        </span>
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
              {canManageResources ? (
                <div className="rounded-xl border border-dashed border-border bg-muted/20 p-4">
                  <CreatePersonForm orgId={orgId} />
                </div>
              ) : null}
            </div>
          </ChartCard>
        </div>
      </main>
    </OrgShell>
  );
}
