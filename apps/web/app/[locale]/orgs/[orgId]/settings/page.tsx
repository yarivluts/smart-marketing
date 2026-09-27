import { notFound, redirect } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { can } from '@growthos/shared';
import { ArrowRight, BadgeCheck, Building2, FolderKanban, FolderOpen, History, Puzzle, Settings, Users } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { OrgShell } from '@/components/orgs/org-shell';
import { StatCard } from '@/components/ui/stat-card';
import { ChartCard } from '@/components/viz/chart-card';
import { InitialsAvatar } from '@/components/viz/initials-avatar';
import { PageHero } from '@/components/viz/page-hero';
import { getServerSession } from '@/lib/auth/get-server-session';
import { resolveOrgSessionContext } from '@/lib/orgs/session-context';
import { findActiveMembership } from '@/lib/orgs/access';
import { isActiveMembershipStatus } from '@/lib/orgs/membership-status';
import { getOrganization, listOrgMembers, listOrgProjects } from '@/lib/orgs/queries';
import { OrganizationSettingsForm } from '@/components/orgs/organization-settings-form';

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
  const principal = { type: 'user' as const, id: user.id };
  if (!membership || !can(bindings, principal, 'billing.manage', { orgId })) {
    notFound();
  }

  const [organization, projects, members] = await Promise.all([getOrganization(orgId), listOrgProjects(orgId), listOrgMembers(orgId)]);
  if (!organization) {
    notFound();
  }

  const t = await getTranslations('OrganizationSettings');
  const numberFormat = new Intl.NumberFormat(locale);
  const activeMembers = members.filter((member) => isActiveMembershipStatus(member.status)).length;
  // How much of the org's own profile is filled in: its name is required, slug and billing contact are optional.
  const profileFields = [organization.name, organization.slug, organization.billing_email];
  const filled = profileFields.filter((value) => typeof value === 'string' && value.trim().length > 0).length;
  const completeness = Math.round((filled / profileFields.length) * 100);

  const related = [
    { href: `/orgs/${orgId}`, label: t('relatedTeam'), icon: Users },
    { href: `/orgs/${orgId}/resources`, label: t('relatedResources'), icon: FolderOpen },
    ...(can(bindings, principal, 'plugin.install', { orgId }) ? [{ href: `/orgs/${orgId}/plugins`, label: t('relatedPlugins'), icon: Puzzle }] : []),
    ...(can(bindings, principal, 'audit.read', { orgId }) ? [{ href: `/orgs/${orgId}/audit-log`, label: t('relatedAudit'), icon: History }] : []),
  ];

  return (
    <OrgShell locale={locale} orgId={orgId}>
      <main className="container mx-auto flex max-w-6xl flex-col gap-6 py-10">
        <PageHero icon={Settings} eyebrow={t('eyebrow')} title={t('title', { orgName: organization.name })} description={t('intro')}>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <StatCard title={t('kpiProjects')} value={numberFormat.format(projects.length)} icon={FolderKanban} />
            <StatCard title={t('kpiMembers')} value={numberFormat.format(activeMembers)} icon={Users} />
            <StatCard
              title={t('kpiProfile')}
              value={`${completeness}%`}
              icon={BadgeCheck}
              progress={completeness}
              subtext={t('kpiProfileSubtext', { filled, total: profileFields.length })}
            />
          </div>
        </PageHero>

        <div className="grid gap-6 lg:grid-cols-3">
          <ChartCard className="lg:col-span-2" title={t('formTitle')} description={t('formDescription')} icon={Settings}>
            <OrganizationSettingsForm
              orgId={orgId}
              initialName={organization.name}
              initialSlug={organization.slug ?? ''}
              initialBillingEmail={organization.billing_email ?? ''}
            />
          </ChartCard>

          <div className="flex flex-col gap-6">
            <ChartCard title={t('profileTitle')} icon={Building2}>
              <div className="flex items-center gap-3">
                <InitialsAvatar name={organization.name} seed={orgId} size="lg" />
                <div className="min-w-0">
                  <p className="truncate font-semibold text-foreground">{organization.name}</p>
                  <p className="truncate font-mono text-xs text-muted-foreground" dir="ltr">
                    {orgId}
                  </p>
                </div>
              </div>
              <dl className="mt-4 flex flex-col gap-2 text-sm">
                <div className="flex items-center justify-between gap-3 rounded-lg bg-muted/40 px-3 py-2">
                  <dt className="text-muted-foreground">{t('profileSlug')}</dt>
                  <dd className="truncate font-medium text-foreground" dir="ltr">
                    {organization.slug || t('profileNotSet')}
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-3 rounded-lg bg-muted/40 px-3 py-2">
                  <dt className="text-muted-foreground">{t('profileBilling')}</dt>
                  <dd className="truncate font-medium text-foreground" dir="ltr">
                    {organization.billing_email || t('profileNotSet')}
                  </dd>
                </div>
              </dl>
            </ChartCard>

            <ChartCard title={t('relatedTitle')} icon={ArrowRight}>
              <ul className="flex flex-col gap-1">
                {related.map((item) => (
                  <li key={item.href}>
                    <Link href={item.href} className="flex items-center gap-3 rounded-lg px-2 py-2 text-sm text-foreground transition-colors hover:bg-primary/5 hover:text-primary">
                      <item.icon className="h-4 w-4 text-primary" aria-hidden="true" />
                      <span className="flex-1">{item.label}</span>
                      <ArrowRight className="h-3.5 w-3.5 text-muted-foreground rtl:rotate-180" aria-hidden="true" />
                    </Link>
                  </li>
                ))}
              </ul>
            </ChartCard>
          </div>
        </div>
      </main>
    </OrgShell>
  );
}
