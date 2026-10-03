import { notFound, redirect } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { BadgeCheck, Shield, ExternalLink } from 'lucide-react';
import { can } from '@growthos/shared';
import { getServerSession } from '@/lib/auth/get-server-session';
import { resolveOrgSessionContext } from '@/lib/orgs/session-context';
import { findActiveMembership } from '@/lib/orgs/access';
import { listOrgPeople, listOrgProjects, listSharedCredentials, listAuditLogEntriesForOrg } from '@/lib/orgs/queries';
import { ProjectSettingsForm } from '@/components/orgs/project-settings-form';
import {
  AccountGovernanceHub,
  type ConnectedPlatform,
  type GovernanceMember,
  type AuditLogEntry,
} from '@/components/governance/account-governance-hub';
import {
  PpPage,
  PpPageHeader,
  PpKpiGrid,
  PpKpiCard,
  PpCard,
  PpButton,
  PpPill,
} from '@/components/pastel/primitives';

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

  const initialPlatforms: ConnectedPlatform[] = sharedCredentials.map((cred) => {
    const isDisconnected = Boolean(cred.archived_at);
    const isPending = !cred.encrypted_secret;
    const status: 'connected' | 'pending' | 'disconnected' = isDisconnected
      ? 'disconnected'
      : isPending
        ? 'pending'
        : 'connected';

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
      status,
      accounts: `${cred.available_scopes?.length ?? 1} Connected Scope${(cred.available_scopes?.length ?? 1) === 1 ? '' : 's'}`,
      syncRate: 'Real-time Webhook',
      scopes: cred.available_scopes && cred.available_scopes.length > 0 ? cred.available_scopes : ['read', 'manage'],
      expiresIn: cred.archived_at
        ? 'Revoked'
        : cred.encrypted_secret
          ? 'Active KMS Vault'
          : 'Active Token',
    };
  });

  const activePeople = people.filter((p) => !p.archived_at);
  const initialMembers: GovernanceMember[] = activePeople.map((person) => {
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
      lastActive: person.created_at ? new Date(person.created_at).toLocaleDateString() : 'Active Member',
    };
  });

  const initialAuditLogs: AuditLogEntry[] = auditLogs.map((entry) => ({
    id: entry.id,
    timestamp: entry.created_at
      ? new Date(entry.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      : 'Recent',
    actor: entry.actor_id === user.id ? `${user.email ?? 'Current User'}` : `${entry.actor_type}:${entry.actor_id.slice(0, 8)}`,
    action: entry.action.replace(/\./g, ' ').toUpperCase(),
    target: entry.target_id
      ? `${entry.target_type}:${entry.target_id.slice(0, 8)}`
      : entry.project_id
        ? `Project ${entry.project_id.slice(0, 8)}`
        : 'Organization',
    status: 'success' as const,
  }));

  const t = await getTranslations('ProjectSettings');

  return (
    <PpPage>
      <PpPageHeader
        eyebrow={t('coreConfiguration')}
        title={t('title', { projectName: project.name })}
        description={t('intro')}
        actions={
          <PpButton variant="ghost" size="sm" icon={ExternalLink} asChild>
            <Link href={`/orgs/${orgId}/projects/${projectId}/setup-checklist`}>
              {t('checklistLink')}
            </Link>
          </PpButton>
        }
      />

      {/* 4 Pastel Executive KPI Summary Row */}
      <PpKpiGrid>
        <PpKpiCard
          label={t('planKpi')}
          value="Enterprise"
          badge="Prod"
          badgeAccent="primary"
          accent="primary"
          footer={<span>Dedicated Edge Pod</span>}
        />
        <PpKpiCard
          label={t('workspacesKpi')}
          value={`${projects.length}`}
          valueSuffix="Linked"
          badge={`${projects.length} Workspaces`}
          badgeAccent="amber"
          accent="amber"
          footer={<span className="truncate">{projects.map((p) => p.name).slice(0, 3).join(', ')}</span>}
        />
        <PpKpiCard
          label={t('teamKpi')}
          value={`${activePeople.length}`}
          valueSuffix={people.length > activePeople.length ? ` / ${people.length}` : undefined}
          badge={`${activePeople.length} ${t('active')}`}
          badgeAccent="mint"
          accent="mint"
          footer={<span>Role-based access matrix active</span>}
        />
        <PpKpiCard
          label={t('credentialsKpi')}
          value={`${sharedCredentials.length}`}
          badge={sharedCredentials.length > 0 ? t('active') : t('none')}
          badgeAccent={sharedCredentials.length > 0 ? 'mint' : 'neutral'}
          accent="sky"
          footer={
            <span>
              {initialPlatforms.filter((p) => p.status === 'connected').length} connected marketing pipelines
            </span>
          }
        />
      </PpKpiGrid>

      {/* Main Bento Grid: Form on Left (7 cols), Governance Overview on Right (5 cols) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <div className="lg:col-span-7">
          <PpCard
            title={t('identityCardTitle')}
            subtitle={t('identityCardSubtitle')}
            icon={BadgeCheck}
            iconAccent="primary"
          >
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
          </PpCard>
        </div>

        <div className="lg:col-span-5 space-y-6">
          <PpCard
            title={t('governanceCardTitle')}
            subtitle={t('governanceCardSubtitle')}
            icon={Shield}
            iconAccent="mint"
          >
            <div className="space-y-4 text-xs">
              <div>
                <span className="font-semibold text-pp-outline uppercase tracking-wider block mb-2">
                  Live Marketing Connectors
                </span>
                {initialPlatforms.length === 0 ? (
                  <p className="text-pp-outline py-2">{t('noCredentials')}</p>
                ) : (
                  <div className="space-y-2">
                    {initialPlatforms.slice(0, 3).map((platform) => (
                      <div
                        key={platform.name}
                        className="flex items-center justify-between rounded-xl bg-pp-surface-container/30 p-2.5"
                      >
                        <div>
                          <p className="font-semibold text-pp-on-surface">{platform.name}</p>
                          <p className="text-[11px] text-pp-outline">{platform.type}</p>
                        </div>
                        <PpPill
                          accent={
                            platform.status === 'connected'
                              ? 'mint'
                              : platform.status === 'pending'
                                ? 'amber'
                                : 'error'
                          }
                          dot
                        >
                          {platform.status}
                        </PpPill>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="border-t border-pp-outline-variant/20 pt-3 space-y-3">
                <span className="font-semibold text-pp-outline uppercase tracking-wider block">
                  {t('securityEnforcements')}
                </span>
                <div className="flex items-center justify-between py-1">
                  <div>
                    <p className="font-semibold text-pp-on-surface">{t('hardware2fa')}</p>
                    <p className="text-[11px] text-pp-outline">{t('hardware2faDesc')}</p>
                  </div>
                  <PpPill accent="mint" dot>{t('active')}</PpPill>
                </div>
                <div className="flex items-center justify-between py-1 border-t border-pp-outline-variant/20 pt-2">
                  <div>
                    <p className="font-semibold text-pp-on-surface">{t('auditTamper')}</p>
                    <p className="text-[11px] text-pp-outline">{t('auditTamperDesc')}</p>
                  </div>
                  <PpPill accent="mint" dot>{t('active')}</PpPill>
                </div>
                <div className="flex items-center justify-between rounded-xl bg-pp-surface-container/30 p-2.5">
                  <span className="font-medium text-pp-on-surface">{t('dataRetention')}</span>
                  <span className="rounded bg-pp-surface-container-lowest px-2 py-0.5 text-xs font-semibold text-pp-primary shadow-pp-candy">
                    {t('retentionValue')}
                  </span>
                </div>
              </div>
            </div>
          </PpCard>
        </div>
      </div>

      {/* Full-width Detailed Governance, RBAC & Audit Hub */}
      <AccountGovernanceHub
        orgId={orgId}
        projectId={projectId}
        isDataConnected={true}
        initialPlatforms={initialPlatforms}
        initialMembers={initialMembers}
        initialAuditLogs={initialAuditLogs}
      />
    </PpPage>
  );
}
