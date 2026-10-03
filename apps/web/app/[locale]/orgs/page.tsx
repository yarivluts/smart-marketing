import { redirect } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Building2, Plus, ArrowRight, Mail } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { NavShell } from '@/components/shell/nav-shell';
import type { NavShellItem, NavShellSection } from '@/components/shell/nav-types';
import {
  PpPage,
  PpPageHeader,
  PpButton,
  PpPill,
  PpEmptyState,
  PpIconChip,
  PpMobileActionBar,
} from '@/components/pastel/primitives';
import { getServerSession } from '@/lib/auth/get-server-session';
import { isActiveMembershipStatus } from '@/lib/orgs/membership-status';
import { resolveOrgSessionContext } from '@/lib/orgs/session-context';

type PageProps = Readonly<{
  params: Promise<{ locale: string }>;
}>;

export async function generateMetadata({ params }: PageProps) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'OrgsPage' });
  return { title: t('title') };
}

function getOrgMonogram(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return name.slice(0, 2).toUpperCase() || 'OG';
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

  const [t, tShell] = await Promise.all([
    getTranslations('OrgsPage'),
    getTranslations('AppShell'),
  ]);

  const orgItems: NavShellItem[] = active.map((m) => ({
    id: `org-${m.organizationId}`,
    href: `/orgs/${m.organizationId}`,
    label: m.organizationName,
    icon: 'Building2',
  }));

  const sections: NavShellSection[] = [
    { heading: t('title'), items: orgItems },
  ];

  const mobileTabItems: NavShellItem[] = [
    { id: 'tab-orgs', href: '/orgs', label: t('title'), icon: 'Building2' },
  ];

  return (
    <NavShell
      brandName={tShell('brandName')}
      organizations={active.map((m) => ({ id: m.organizationId, name: m.organizationName }))}
      userEmail={session.email ?? undefined}
      sections={sections}
      mobileTabItems={mobileTabItems}
    >
      <PpPage>
        <PpPageHeader
          eyebrow={t('eyebrow')}
          title={t('title')}
          description={t('description')}
          actions={
            <PpButton asChild variant="primary" icon={Plus}>
              <Link href="/orgs/new">{t('createOrganization')}</Link>
            </PpButton>
          }
        />

        {/* Active Organizations Section */}
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <h2 className="font-pp-display text-pp-headline-md font-bold text-pp-on-surface">
                {t('activeOrganizations')}
              </h2>
              <PpPill accent="primary">{active.length}</PpPill>
            </div>
            <span className="text-pp-label-sm uppercase tracking-wider text-pp-outline">
              {t('quickAccess')}
            </span>
          </div>

          {active.length === 0 ? (
            <PpEmptyState
              icon={Building2}
              title={t('empty')}
              description={t('emptyDesc')}
              action={
                <PpButton asChild variant="primary" icon={Plus}>
                  <Link href="/orgs/new">{t('createOrganization')}</Link>
                </PpButton>
              }
            />
          ) : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {active.map((membership) => (
                <article
                  key={membership.organizationId}
                  className="flex flex-col justify-between rounded-2xl bg-pp-surface-container-lowest p-6 shadow-pp-candy transition-all duration-200 hover:shadow-pp-candy-hover"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-4">
                      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-pp-primary to-pp-primary-container font-pp-display text-pp-headline-md font-extrabold text-pp-on-primary shadow-sm">
                        {getOrgMonogram(membership.organizationName)}
                      </div>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="font-pp-display text-pp-headline-md font-bold text-pp-on-surface truncate">
                            {membership.organizationName}
                          </h3>
                          <PpPill accent="primary">
                            {t('roleLabel', { role: membership.role })}
                          </PpPill>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="mt-6 flex items-center justify-end border-t border-pp-surface-container-highest/60 pt-4">
                    <PpButton
                      asChild
                      variant="primary"
                      size="sm"
                      icon={ArrowRight}
                      className="[&>svg]:rtl:rotate-180"
                    >
                      <Link href={`/orgs/${membership.organizationId}`}>{t('open')}</Link>
                    </PpButton>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        {/* Pending Invitations Section */}
        {pending.length > 0 ? (
          <section className="space-y-4">
            <div className="flex items-center gap-2.5">
              <h2 className="font-pp-display text-pp-headline-md font-bold text-pp-on-surface">
                {t('pendingInvites')}
              </h2>
              <PpPill accent="pink">{pending.length}</PpPill>
            </div>
            <div className="space-y-3">
              {pending.map((membership) => (
                <div
                  key={membership.membershipId}
                  className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-2xl border-2 border-dashed border-pp-outline-variant/60 bg-pp-surface-container-lowest/80 p-5 md:p-6 backdrop-blur-sm"
                >
                  <div className="flex items-start gap-4">
                    <PpIconChip icon={Mail} accent="pink" size="md" />
                    <div>
                      <h3 className="font-pp-display text-pp-headline-md font-bold text-pp-on-surface">
                        {membership.organizationName}
                      </h3>
                      <p className="mt-0.5 text-pp-body-sm text-pp-on-surface-variant">
                        {t('roleLabel', { role: membership.role })}
                      </p>
                    </div>
                  </div>
                  <PpButton
                    asChild
                    variant="secondary"
                    size="sm"
                    icon={ArrowRight}
                    className="[&>svg]:rtl:rotate-180"
                  >
                    <Link href={`/invite/${membership.organizationId}/${membership.membershipId}`}>
                      {t('viewInvite')}
                    </Link>
                  </PpButton>
                </div>
              ))}
            </div>
          </section>
        ) : null}

        {/* Mobile Action Bar */}
        <PpMobileActionBar>
          <PpButton asChild variant="primary" className="w-full" icon={Plus}>
            <Link href="/orgs/new">{t('createOrganization')}</Link>
          </PpButton>
        </PpMobileActionBar>
      </PpPage>
    </NavShell>
  );
}
