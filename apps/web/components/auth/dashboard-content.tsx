'use client';

import { useEffect, type ReactElement } from 'react';
import { useTranslations } from 'next-intl';
import {
  Building2,
  Plus,
  ShieldCheck,
  Sparkles,
  ArrowRight,
  LogOut,
  Mail,
} from 'lucide-react';
import { Link, useRouter } from '@/i18n/navigation';
import { useAuth } from '@/lib/auth/auth-context';
import { useOrgContext } from '@/lib/orgs/org-context';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

export function DashboardContent(): ReactElement | null {
  const t = useTranslations('DashboardPage');
  const router = useRouter();
  const { user, loading, signOut } = useAuth();
  const { memberships, loading: orgsLoading } = useOrgContext();

  useEffect(() => {
    if (!loading && !user) {
      router.replace('/login');
    }
  }, [loading, user, router]);

  async function handleSignOut(): Promise<void> {
    await signOut();
    router.replace('/login');
  }

  if (!user) {
    return null;
  }

  const activeMemberships = memberships.filter((membership) => membership.status !== 'invited');
  const pendingInvites = memberships.filter((membership) => membership.status === 'invited');
  const topRole = activeMemberships[0]?.role ?? 'viewer';

  return (
    <main className="container mx-auto flex max-w-5xl flex-col gap-10 py-10 px-4 sm:px-6">
      {/* Executive User Header */}
      <header className="flex flex-col justify-between gap-6 rounded-3xl border border-border bg-card p-6 sm:flex-row sm:items-center sm:p-8 shadow-soft">
        <div className="flex items-center gap-4">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-brand-gradient text-xl font-bold text-white shadow-soft">
            {(user.email?.[0] ?? 'U').toUpperCase()}
          </div>
          <div className="flex flex-col gap-1">
            <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
              {t('title')}
            </h1>
            <p className="text-sm text-muted-foreground">
              {t('welcome', { email: user.email ?? '' })}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Button asChild size="sm">
            <Link href="/orgs/new">
              <Plus className="me-1.5 h-4 w-4" aria-hidden="true" />
              {t('createOrganization')}
            </Link>
          </Button>
          <Button variant="outline" size="sm" onClick={handleSignOut}>
            <LogOut className="me-1.5 h-4 w-4" aria-hidden="true" />
            {t('signOut')}
          </Button>
        </div>
      </header>

      {/* Stats Ribbon */}
      <section className="grid grid-cols-2 gap-4 sm:grid-cols-4" aria-label={t('overviewHeading')}>
        <Card className="flex flex-col gap-1 p-5 shadow-soft">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-semibold uppercase tracking-wider">{t('statOrgs')}</span>
            <Building2 className="h-4 w-4 text-primary" aria-hidden="true" />
          </div>
          <span className="text-2xl font-bold text-foreground">{activeMemberships.length}</span>
        </Card>

        <Card className="flex flex-col gap-1 p-5 shadow-soft">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-semibold uppercase tracking-wider">{t('statActive')}</span>
            <ShieldCheck className="h-4 w-4 text-primary" aria-hidden="true" />
          </div>
          <span className="text-2xl font-bold text-foreground">{activeMemberships.length}</span>
        </Card>

        <Card className="flex flex-col gap-1 p-5 shadow-soft">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-semibold uppercase tracking-wider">{t('statInvites')}</span>
            <Mail className="h-4 w-4 text-primary" aria-hidden="true" />
          </div>
          <span className="text-2xl font-bold text-foreground">{pendingInvites.length}</span>
        </Card>

        <Card className="flex flex-col gap-1 p-5 shadow-soft">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-semibold uppercase tracking-wider">{t('statRole')}</span>
            <Sparkles className="h-4 w-4 text-primary" aria-hidden="true" />
          </div>
          <span className="truncate text-base font-bold text-foreground capitalize">{topRole}</span>
        </Card>
      </section>

      {/* Pending Invites Callout */}
      {pendingInvites.length > 0 ? (
        <Card className="flex items-center justify-between gap-4 border-primary/30 bg-primary/5 p-4 sm:p-5 shadow-soft">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Mail className="h-5 w-5" aria-hidden="true" />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">
                {t('pendingInvites', { count: pendingInvites.length })}
              </p>
              <p className="text-xs text-muted-foreground">{t('pendingInvitesDesc')}</p>
            </div>
          </div>
          <Button asChild size="sm">
            <Link href="/orgs">{t('pendingInvites', { count: pendingInvites.length })}</Link>
          </Button>
        </Card>
      ) : null}

      {/* Organizations Workspace Grid */}
      <section className="flex flex-col gap-6" aria-busy={orgsLoading}>
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold tracking-tight text-foreground">
              {t('organizationsHeading')}
            </h2>
            <p className="text-xs text-muted-foreground">{t('quickLinksHeading')}</p>
          </div>
          <Button asChild variant="ghost" size="sm">
            <Link href="/orgs">
              {t('allOrganizations')}
              <ArrowRight className="ms-1.5 h-4 w-4" aria-hidden="true" />
            </Link>
          </Button>
        </div>

        {orgsLoading ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <Card key={i} className="h-40 animate-pulse bg-muted/40 p-6" />
            ))}
          </div>
        ) : activeMemberships.length === 0 ? (
          <Card className="bg-brand-wash flex flex-col items-center justify-center gap-6 p-10 text-center sm:p-14">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary shadow-soft">
              <Building2 className="h-7 w-7" aria-hidden="true" />
            </div>
            <div className="flex flex-col gap-2">
              <h3 className="text-xl font-bold text-foreground">{t('noOrganizations')}</h3>
              <p className="max-w-lg text-sm text-muted-foreground">{t('noOrganizationsDesc')}</p>
            </div>

            <div className="grid max-w-xl grid-cols-1 gap-3 text-start sm:grid-cols-3">
              <div className="rounded-xl border border-border/70 bg-card p-3 shadow-soft">
                <span className="text-xs font-semibold text-primary">{t('step1Title')}</span>
                <p className="mt-1 text-[11px] text-muted-foreground">{t('step1Desc')}</p>
              </div>
              <div className="rounded-xl border border-border/70 bg-card p-3 shadow-soft">
                <span className="text-xs font-semibold text-primary">{t('step2Title')}</span>
                <p className="mt-1 text-[11px] text-muted-foreground">{t('step2Desc')}</p>
              </div>
              <div className="rounded-xl border border-border/70 bg-card p-3 shadow-soft">
                <span className="text-xs font-semibold text-primary">{t('step3Title')}</span>
                <p className="mt-1 text-[11px] text-muted-foreground">{t('step3Desc')}</p>
              </div>
            </div>

            <Button asChild size="lg" className="mt-2">
              <Link href="/orgs/new">
                <Plus className="me-2 h-4 w-4" aria-hidden="true" />
                {t('createFirstOrganization')}
              </Link>
            </Button>
          </Card>
        ) : (
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {activeMemberships.map((membership) => (
              <Card
                key={membership.membershipId}
                className="group flex flex-col justify-between overflow-hidden rounded-2xl border border-border bg-card p-6 shadow-soft transition-all duration-200 hover:-translate-y-1 hover:border-primary/40 hover:shadow-soft-md"
              >
                <div className="flex flex-col gap-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
                      <Building2 className="h-5 w-5" aria-hidden="true" />
                    </div>
                    <span className="rounded-full bg-secondary px-2.5 py-0.5 text-xs font-semibold text-secondary-foreground capitalize">
                      {membership.role}
                    </span>
                  </div>

                  <div>
                    <Link
                      href={`/orgs/${membership.organizationId}`}
                      className="text-lg font-bold tracking-tight text-foreground hover:text-primary"
                    >
                      <h3>{membership.organizationName}</h3>
                    </Link>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {t('roleLabel', { role: membership.role })}
                    </p>
                  </div>
                </div>

                <div className="mt-6 flex flex-col gap-3">
                  <div className="flex items-center gap-2 border-t border-border pt-4">
                    <Button asChild variant="outline" size="sm" className="flex-1 text-xs">
                      <Link href={`/orgs/${membership.organizationId}/resources`}>
                        {t('settingsLink')}
                      </Link>
                    </Button>
                    <Button asChild size="sm" className="flex-1 text-xs">
                      <Link href={`/orgs/${membership.organizationId}`}>
                        <span>{t('openWorkspace')}</span>
                        <ArrowRight className="ms-1 h-3.5 w-3.5" aria-hidden="true" />
                      </Link>
                    </Button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}

