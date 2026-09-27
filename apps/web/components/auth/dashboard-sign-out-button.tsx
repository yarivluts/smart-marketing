'use client';

import { useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { LogOut } from 'lucide-react';
import { useRouter } from '@/i18n/navigation';
import { useAuth } from '@/lib/auth/auth-context';
import { Button } from '@/components/ui/button';

/**
 * The dashboard's sign-out action. It also owns the client-side guard the dashboard always had: the
 * server already verified the session cookie, but the client's own Firebase Auth state is the
 * source of truth once it resolves (e.g. a stale cookie after signing out in another tab).
 */
export function DashboardSignOutButton(): React.ReactElement {
  const t = useTranslations('DashboardPage');
  const router = useRouter();
  const { user, loading, signOut } = useAuth();

  useEffect(() => {
    if (!loading && !user) {
      router.replace('/login');
    }
  }, [loading, user, router]);

  async function handleSignOut(): Promise<void> {
    await signOut();
    router.replace('/login');
  }

  return (
    <Button variant="outline" size="sm" onClick={handleSignOut}>
      <LogOut className="h-4 w-4 rtl:rotate-180" aria-hidden="true" />
      {t('signOut')}
    </Button>
  );
}
