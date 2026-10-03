import { notFound, redirect } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { can } from '@growthos/shared';
import { getServerSession } from '@/lib/auth/get-server-session';
import { resolveOrgSessionContext } from '@/lib/orgs/session-context';
import { findActiveMembership } from '@/lib/orgs/access';
import { listOrgPeople, listOrgProjects, listSharedCredentials, listAuditLogEntriesForOrg } from '@/lib/orgs/queries';
import { ProjectSettingsForm } from '@/components/orgs/project-settings-form';
import { AccountGovernanceHub, type ConnectedPlatform, type GovernanceMember, type AuditLogEntry } from '@/components/governance/account-governance-hub';

type PageProps = Readonly<{
  params: Promise<{ locale: string; orgId: string; projectId: string }>;
}>;

export async function generateMetadata({ params }: PageProps) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'ProjectSettings' });
  return { title: t('metaTitle') };
}

/**
 * Where an admin corrects a project's own `name`/`vertical` once it's been
 * created — see `updateProjectDetails`'s doc comment for why this closes a
 * gap that's existed since KAN-25. `session_replay_url_template` has its
 * own dedicated page (`.../session-replay`).
 *
 * Gated on `project.manage`, the same per-project admin-config permission
 * the session-replay and cost-guardrails pages use.
 */
export default async function ProjectSettingsPage({ params }: PageProps): Promise<React.ReactElement> {
  const { locale, orgId, projectId } = await params;
  setRequestLocale(locale);

  const session = await getServerSession();
  if (!session) {
    redirect(`/${locale}/login?from=%2Forgs%2F${orgId}%2Fprojects%2F${projectId}%2Fsettings`);
  }

  const { user, memberships, bindings } = await resolveOrgSessionContext(session);
  const membership = findActiveMembership(memberships, orgId);
  if (!membership || !can(bindings, { type: 'user', id: user.id }, 'project.manage', { orgId })) {
    notFound();
  }

  const [projects, sharedCredentials, people, auditLogs] = await Promise.all([
    listOrgProjects(orgId),
    listSharedCredentials(orgId).catch(() => []),
    listOrgPeople(orgId).catch(() => []),
    listAuditLogEntriesForOrg(orgId, 10).catch(() => []),
  ]);
  const project = projects.find((candidate) => candidate.id === projectId);
  if (!project) {
    if (projects.length > 0) {
      redirect(`/${locale}/orgs/${orgId}/projects/${projects[0].id}/settings`);
    }
    redirect(`/${locale}/orgs/${orgId}`);
  }

  const initialPlatforms: ConnectedPlatform[] | undefined =
    sharedCredentials.length > 0
      ? sharedCredentials.map((cred) => {
          const providerLabel =
            cred.provider === 'google_ads'
              ? 'Google Ads API'
              : cred.provider === 'meta_ads'
                ? 'Meta Graph API'
                : cred.provider === 'stripe'
                  ? 'Stripe Billing'
                  : cred.provider === 'ga4'
                    ? 'Google Analytics 4'
                    : cred.name || 'Custom Credential';
          const typeLabel =
            cred.provider === 'google_ads'
              ? 'Search & Performance Max'
              : cred.provider === 'meta_ads'
                ? 'Social Paid Media'
                : cred.provider === 'stripe'
                  ? 'Payment Gateway'
                  : cred.provider === 'ga4'
                    ? 'Web Analytics'
                    : 'Custom Integration';
          return {
            name: cred.name || providerLabel,
            type: typeLabel,
            status: 'connected',
            accounts: `${cred.available_scopes?.length ?? 1} Connected Account${(cred.available_scopes?.length ?? 1) === 1 ? '' : 's'}`,
            syncRate: 'Real-time Webhook',
            scopes: cred.available_scopes && cred.available_scopes.length > 0 ? cred.available_scopes : ['read', 'manage'],
            expiresIn: cred.encrypted_secret ? 'Active KMS Vault' : 'Active OAuth',
          };
        })
      : undefined;

  const activePeople = people.filter((p) => !p.archived_at);
  const initialMembers: GovernanceMember[] | undefined =
    activePeople.length > 0
      ? activePeople.map((person) => {
          const initials =
            person.name
              .split(' ')
              .filter(Boolean)
              .slice(0, 2)
              .map((w) => w[0].toUpperCase())
              .join('') || 'U';
          let role: GovernanceMember['role'] = 'Agency Admin';
          const titleLower = (person.title || '').toLowerCase();
          if (titleLower.includes('buyer') || titleLower.includes('media')) {
            role = 'Media Buyer';
          } else if (titleLower.includes('exp') || titleLower.includes('growth')) {
            role = 'Experimenter';
          } else if (titleLower.includes('viewer') || titleLower.includes('client')) {
            role = 'Client Viewer';
          }
          return {
            name: person.name,
            initials,
            role,
            lastActive: 'Active now',
          };
        })
      : undefined;

  const initialAuditLogs: AuditLogEntry[] | undefined =
    auditLogs.length > 0
      ? auditLogs.map((entry) => ({
          id: entry.id,
          timestamp: entry.created_at
            ? new Date(entry.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            : 'Just now',
          actor: entry.actor_id === user.id ? `${user.email ?? 'Current User'}` : `${entry.actor_type}:${entry.actor_id.slice(0, 8)}`,
          action: entry.action.replace(/\./g, ' ').toUpperCase(),
          target: entry.target_id
            ? `${entry.target_type}:${entry.target_id.slice(0, 8)}`
            : entry.project_id
              ? `Project ${entry.project_id.slice(0, 8)}`
              : 'Organization',
          status: 'success' as const,
        }))
      : undefined;

  const t = await getTranslations('ProjectSettings');

  return (
    <main className="w-full space-y-10">
      {/* Stitch Account Governance, Ad Connections & Audit Logs */}
      <AccountGovernanceHub
        orgId={orgId}
        projectId={projectId}
        isDataConnected={true}
        initialPlatforms={initialPlatforms}
        initialMembers={initialMembers}
        initialAuditLogs={initialAuditLogs}
      />

      <div className="rounded-2xl border border-border bg-card p-6 shadow-sm space-y-6 max-w-3xl">
        <div className="flex flex-col gap-2">
          <h2 className="text-xl font-bold tracking-tight text-foreground">{t('title', { projectName: project.name })}</h2>
          <p className="text-xs text-muted-foreground">{t('intro')}</p>
        </div>

        <section>
          <ProjectSettingsForm
            orgId={orgId}
            projectId={projectId}
            initialName={project.name}
            initialVertical={project.vertical ?? ''}
            initialPlatformType={project.platform_type ?? 'web'}
            initialBusinessModel={project.business_model ?? 'saas_subscription'}
            initialTransactionType={project.transaction_type ?? 'monthly_recurring'}
            initialPrimaryStack={project.primary_stack ?? 'custom_web'}
          />
      </section>
      </div>
    </main>
  );
}
