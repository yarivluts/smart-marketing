'use client';

import { useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { useAuth } from '@/lib/auth/auth-context';
import { Button } from '@/components/ui/button';

export function DashboardContent(): React.ReactElement | null {
  const t = useTranslations('DashboardPage');
  const router = useRouter();
  const { user, loading, signOut } = useAuth();

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

  return (
    <main className="container flex min-h-screen flex-col items-center justify-center gap-6 py-16 text-center">
      <h1 className="text-3xl font-bold tracking-tight">{t('title')}</h1>
      <p className="text-muted-foreground">{t('welcome', { email: user.email ?? '' })}</p>
      <Button onClick={handleSignOut}>{t('signOut')}</Button>
    </main>
  );
}
