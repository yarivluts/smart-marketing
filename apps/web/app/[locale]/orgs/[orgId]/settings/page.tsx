import { notFound, redirect } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { BadgeCheck, FolderKanban, Mail, Users } from 'lucide-react';
import { can } from '@growthos/shared';
import { getServerSession } from '@/lib/auth/get-server-session';
import { resolveOrgSessionContext } from '@/lib/orgs/session-context';
import { findActiveMembership } from '@/lib/orgs/access';
import { getOrganization, listOrgMembers, listOrgProjects } from '@/lib/orgs/queries';
import { OrganizationSettingsForm } from '@/components/orgs/organization-settings-form';
import { OrgShell } from '@/components/orgs/org-shell';
import { Link } from '@/i18n/navigation';
import { PpCard, PpInsetRow, PpKpiCard, PpKpiGrid, PpPage, PpPageHeader, PpPill } from '@/components/pastel/primitives';

type PageProps = Readonly<{
  params: Promise<{ locale: string; orgId: string }>;
}>;

export async function generateMetadata({ params }: PageProps) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'OrganizationSettings' });
  return { title: t('metaTitle') };
}

/**
 * Where an org owner corrects the org's own `name`/`slug`/`billing_email`
 * once it's been created — see `updateOrganization`'s doc comment for why
 * this closes a gap that's existed since KAN-25.
 *
 * Gated on `billing.manage` (org-owner-only), not `project.manage` — see
 * `updateOrganization`'s own doc comment for why this is the first real
 * route that permission gates.
 *
 * Layout follows the Stitch "Project Settings & Governance" screen
 * (3a067294…): eyebrow + title header, accent KPI row, then the identity card.
 * Every KPI is real data (project/member counts, billing-email presence).
 */
export default async function OrganizationSettingsPage({ params }: PageProps): Promise<React.ReactElement> {
  const { locale, orgId } = await params;
  setRequestLocale(locale);

  const session = await getServerSession();
  if (!session) {
    redirect(`/${locale}/login?from=%2Forgs%2F${orgId}%2Fsettings`);
  }

  const { user, memberships, bindings } = await resolveOrgSessionContext(session);
  const membership = findActiveMembership(memberships, orgId);
  if (!membership || !can(bindings, { type: 'user', id: user.id }, 'billing.manage', { orgId })) {
    notFound();
  }

  const [organization, projects, members, t] = await Promise.all([
    getOrganization(orgId),
    listOrgProjects(orgId),
    listOrgMembers(orgId),
    getTranslations('OrganizationSettings'),
  ]);
  if (!organization) {
    notFound();
  }

  const hasBillingEmail = Boolean(organization.billing_email);

  return (
    <OrgShell locale={locale} orgId={orgId}>
      <PpPage>
        <PpPageHeader
          eyebrow={t('eyebrow')}
          title={t('title', { orgName: organization.name })}
          description={t('intro')}
        />

        <PpKpiGrid className="lg:grid-cols-3">
          <PpKpiCard
            accent="primary"
            label={t('kpiProjects')}
            value={projects.length}
            footer={
              <Link href={`/orgs/${orgId}`} className="font-semibold text-pp-primary hover:underline">
                {t('kpiProjectsLink')}
              </Link>
            }
          />
          <PpKpiCard
            accent="mint"
            label={t('kpiMembers')}
            value={members.length}
            footer={t('kpiMembersHint')}
          />
          <PpKpiCard
            accent={hasBillingEmail ? 'mint' : 'amber'}
            label={t('kpiBilling')}
            value={hasBillingEmail ? t('kpiBillingSet') : t('kpiBillingMissing')}
            badge={hasBillingEmail ? undefined : t('kpiBillingAction')}
            badgeAccent="amber"
            footer={<span dir="ltr">{organization.billing_email || '—'}</span>}
          />
        </PpKpiGrid>

        <div className="grid gap-pp-lg xl:grid-cols-3">
          <PpCard
            className="xl:col-span-2"
            icon={BadgeCheck}
            title={t('identityTitle')}
            subtitle={t('identitySubtitle')}
          >
            <OrganizationSettingsForm
              orgId={orgId}
              initialName={organization.name}
              initialSlug={organization.slug ?? ''}
              initialBillingEmail={organization.billing_email ?? ''}
            />
          </PpCard>

          <PpCard icon={FolderKanban} iconAccent="amber" title={t('projectsTitle')} subtitle={t('projectsSubtitle')}>
            {projects.length === 0 ? (
              <p className="text-pp-body-md text-pp-on-surface-variant">{t('projectsEmpty')}</p>
            ) : (
              <div className="space-y-2">
                {projects.map((project) => (
                  <PpInsetRow key={project.id}>
                    <Link
                      href={`/orgs/${orgId}/projects/${project.id}`}
                      className="min-w-0 truncate text-pp-label-md text-pp-on-surface hover:text-pp-primary"
                    >
                      {project.name}
                    </Link>
                    {project.vertical ? <PpPill accent="neutral">{project.vertical}</PpPill> : null}
                  </PpInsetRow>
                ))}
              </div>
            )}
            <div className="mt-pp-md flex items-center gap-2 text-pp-body-sm text-pp-on-surface-variant">
              <Users className="h-4 w-4" aria-hidden />
              <span>{t('membersFootnote', { count: members.length })}</span>
            </div>
            <div className="mt-1 flex items-center gap-2 text-pp-body-sm text-pp-on-surface-variant">
              <Mail className="h-4 w-4" aria-hidden />
              <span>{t('billingFootnote')}</span>
            </div>
          </PpCard>
        </div>
      </PpPage>
    </OrgShell>
  );
}
