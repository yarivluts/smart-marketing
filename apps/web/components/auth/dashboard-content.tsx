'use client';

import { useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { Link, useRouter } from '@/i18n/navigation';
import { useAuth } from '@/lib/auth/auth-context';
import { useOrgContext } from '@/lib/orgs/org-context';
import { Button } from '@/components/ui/button';

export function DashboardContent(): React.ReactElement | null {
  const t = useTranslations('DashboardPage');
  const router = useRouter();
  const { user, loading, signOut } = useAuth();
  const { memberships, loading: orgsLoading } = useOrgContext();

  useEffect(() => {
    // The middleware already gated this route on the session cookie, but the
    // client's own Firebase Auth state is the source of truth once it
    // resolves (e.g. a stale/cleared cookie from another tab).
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

  return (
    <main className="container mx-auto flex min-h-screen max-w-2xl flex-col gap-8 py-16">
      <header className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-3xl font-bold tracking-tight">{t('title')}</h1>
          <p className="text-muted-foreground">{t('welcome', { email: user.email ?? '' })}</p>
        </div>
        <Button variant="outline" size="sm" onClick={handleSignOut}>
          {t('signOut')}
        </Button>
      </header>

      <section className="flex flex-col gap-4" aria-busy={orgsLoading}>
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold">{t('organizationsHeading')}</h2>
          <Button asChild size="sm">
            <Link href="/orgs/new">{t('createOrganization')}</Link>
          </Button>
        </div>

        {orgsLoading ? (
          <p className="text-muted-foreground">{t('loadingOrganizations')}</p>
        ) : activeMemberships.length === 0 ? (
          <div className="flex flex-col items-start gap-3 rounded-lg border p-6">
            <p className="text-muted-foreground">{t('noOrganizations')}</p>
            <Button asChild>
              <Link href="/orgs/new">{t('createFirstOrganization')}</Link>
            </Button>
          </div>
        ) : (
          <ul className="flex flex-col gap-2">
            {activeMemberships.map((membership) => (
              <li key={membership.membershipId}>
                <Link
                  href={`/orgs/${membership.organizationId}`}
                  className="flex items-center justify-between rounded-lg border p-4 transition-colors hover:bg-accent"
                >
                  <span className="font-medium">{membership.organizationName}</span>
                  <span className="text-sm text-muted-foreground">
                    {t('roleLabel', { role: membership.role })}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}

        {pendingInvites.length > 0 ? (
          <p className="text-sm text-muted-foreground">
            <Link href="/orgs" className="underline underline-offset-4">
              {t('pendingInvites', { count: pendingInvites.length })}
            </Link>
          </p>
        ) : null}

        <p className="text-sm text-muted-foreground">
          <Link href="/orgs" className="underline underline-offset-4">
            {t('allOrganizations')}
          </Link>
        </p>
      </section>
    </main>
  );
}
