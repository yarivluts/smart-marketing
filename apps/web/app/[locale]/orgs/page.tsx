import { redirect } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { ArrowRight, Building2, FolderKanban, Mail, Plus, Users } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { StatCard } from '@/components/ui/stat-card';
import { ChartCard } from '@/components/viz/chart-card';
import { EmptyState } from '@/components/viz/empty-state';
import { PageHero } from '@/components/viz/page-hero';
import { InitialsAvatar } from '@/components/viz/initials-avatar';
import { getServerSession } from '@/lib/auth/get-server-session';
import { isActiveMembershipStatus } from '@/lib/orgs/membership-status';
import { resolveOrgSessionContext } from '@/lib/orgs/session-context';
import { listOrgMembers, listOrgProjects } from '@/lib/orgs/queries';

const PROJECT_CHIP_LIMIT = 4;

type PageProps = Readonly<{
  params: Promise<{ locale: string }>;
}>;

export async function generateMetadata({ params }: PageProps) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'OrgsPage' });
  return { title: t('title') };
}

/** Org switcher's list view (KAN-25): every org the user belongs to, plus any pending invites waiting on them. */
export default async function OrgsPage({ params }: PageProps): Promise<React.ReactElement> {
  const { locale } = await params;
  setRequestLocale(locale);

  const session = await getServerSession();
  if (!session) {
    redirect(`/${locale}/login?from=%2Forgs`);
  }

  const { memberships } = await resolveOrgSessionContext(session);
  const active = memberships.filter((membership) => isActiveMembershipStatus(membership.status));
  const pending = memberships.filter((membership) => membership.status === 'invited');
  const t = await getTranslations('OrgsPage');

  // Real counts for each org the user is an active member of (any member can already see both on the org's own page).
  const stats = await Promise.all(
    active.map(async (membership) => {
      const [projects, members] = await Promise.all([listOrgProjects(membership.organizationId), listOrgMembers(membership.organizationId)]);
      return {
        projectCount: projects.length,
        projectNames: projects.slice(0, PROJECT_CHIP_LIMIT).map((project) => ({ id: project.id, name: project.name })),
        memberCount: members.filter((member) => isActiveMembershipStatus(member.status)).length,
      };
    }),
  );
  const totalProjects = stats.reduce((sum, stat) => sum + stat.projectCount, 0);
  const numberFormat = new Intl.NumberFormat(locale);

  return (
    <main className="container mx-auto flex max-w-6xl flex-col gap-6 py-10">
      <PageHero
        icon={Building2}
        eyebrow={t('eyebrow')}
        title={t('title')}
        description={t('heroDescription')}
        actions={
          <Button asChild size="sm">
            <Link href="/orgs/new">
              <Plus className="h-4 w-4" aria-hidden="true" />
              {t('createOrganization')}
            </Link>
          </Button>
        }
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <StatCard title={t('kpiOrganizations')} value={numberFormat.format(active.length)} icon={Building2} />
          <StatCard title={t('kpiProjects')} value={numberFormat.format(totalProjects)} icon={FolderKanban} />
          <StatCard title={t('kpiInvites')} value={numberFormat.format(pending.length)} icon={Mail} />
        </div>
      </PageHero>

      {active.length === 0 ? (
        <EmptyState
          icon={Building2}
          title={t('empty')}
          description={t('emptyHint')}
          action={
            <Button asChild>
              <Link href="/orgs/new">{t('createOrganization')}</Link>
            </Button>
          }
        />
      ) : (
        <div>
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {active.map((membership, index) => (
              <li key={membership.organizationId} className="flex flex-col rounded-2xl border border-border bg-card p-5 shadow-sm transition-shadow hover:shadow-md">
                <div className="flex items-start gap-3">
                  <InitialsAvatar name={membership.organizationName} seed={membership.organizationId} size="lg" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-base font-semibold text-foreground">{membership.organizationName}</p>
                    <Badge variant="secondary" size="sm" className="mt-1">
                      {t('roleLabel', { role: membership.role })}
                    </Badge>
                  </div>
                </div>
                <dl className="mt-4 grid grid-cols-2 gap-2 rounded-xl bg-muted/40 p-3">
                  <div className="flex items-center gap-2">
                    <FolderKanban className="h-4 w-4 text-primary" aria-hidden="true" />
                    <div>
                      <dt className="text-[11px] text-muted-foreground">{t('cardProjects')}</dt>
                      <dd className="text-sm font-semibold tabular-nums text-foreground">{numberFormat.format(stats[index]?.projectCount ?? 0)}</dd>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Users className="h-4 w-4 text-primary" aria-hidden="true" />
                    <div>
                      <dt className="text-[11px] text-muted-foreground">{t('cardMembers')}</dt>
                      <dd className="text-sm font-semibold tabular-nums text-foreground">{numberFormat.format(stats[index]?.memberCount ?? 0)}</dd>
                    </div>
                  </div>
                </dl>
                {(stats[index]?.projectNames.length ?? 0) > 0 ? (
                  <ul className="mt-3 flex flex-wrap gap-1.5" aria-label={t('cardProjects')}>
                    {stats[index]?.projectNames.map((project) => (
                      <li key={project.id} className="flex items-center gap-1.5 rounded-full border border-border bg-background/60 py-0.5 pe-2.5 ps-0.5 text-xs text-foreground">
                        <InitialsAvatar name={project.name} seed={project.id} size="sm" className="h-5 w-5 text-[9px]" />
                        {project.name}
                      </li>
                    ))}
                    {(stats[index]?.projectCount ?? 0) > PROJECT_CHIP_LIMIT ? (
                      <li className="rounded-full bg-muted px-2.5 py-0.5 text-xs text-muted-foreground">{t('cardMoreProjects', { count: (stats[index]?.projectCount ?? 0) - PROJECT_CHIP_LIMIT })}</li>
                    ) : null}
                  </ul>
                ) : null}
                <div className="mt-auto flex justify-end pt-4">
                  <Button asChild size="sm" variant="outline">
                    <Link href={`/orgs/${membership.organizationId}`}>
                      {t('open')}
                      <ArrowRight className="h-3.5 w-3.5 rtl:rotate-180" aria-hidden="true" />
                    </Link>
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {pending.length > 0 ? (
        <ChartCard title={t('pendingInvites')} description={t('pendingInvitesDescription')} icon={Mail}>
          <ul className="flex flex-col gap-3">
            {pending.map((membership) => (
              <li key={membership.membershipId} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-dashed border-primary/40 bg-primary/5 p-4">
                <div className="flex items-center gap-3">
                  <InitialsAvatar name={membership.organizationName} seed={membership.organizationId} />
                  <div>
                    <p className="font-medium">{membership.organizationName}</p>
                    <p className="text-sm text-muted-foreground">{t('roleLabel', { role: membership.role })}</p>
                  </div>
                </div>
                <Button asChild size="sm">
                  <Link href={`/invite/${membership.organizationId}/${membership.membershipId}`}>{t('viewInvite')}</Link>
                </Button>
              </li>
            ))}
          </ul>
        </ChartCard>
      ) : null}
    </main>
  );
}
