'use client';

import { useTranslations } from 'next-intl';
import { Link, useRouter } from '@/i18n/navigation';
import { useAuth } from '@/lib/auth/auth-context';
import { Button } from '@/components/ui/button';

/** Shows the signed-in user (with sign-out) or sign-in/sign-up links otherwise. */
export function AccountStatus(): React.ReactElement | null {
  const t = useTranslations('AccountStatus');
  const router = useRouter();
  const { user, loading, signOut } = useAuth();

  if (loading) {
    return null;
  }

  async function handleSignOut(): Promise<void> {
    await signOut();
    router.refresh();
  }

  if (user) {
    return (
      <div className="flex flex-col items-center gap-3 text-sm">
        <span className="text-muted-foreground">{t('signedInAs', { email: user.email ?? '' })}</span>
        <div className="flex gap-3">
          <Button asChild size="sm">
            <Link href="/dashboard">{t('goToDashboard')}</Link>
          </Button>
          <Button size="sm" variant="outline" onClick={handleSignOut}>
            {t('signOut')}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex gap-3">
      <Button asChild size="sm">
        <Link href="/login">{t('signIn')}</Link>
      </Button>
      <Button asChild size="sm" variant="outline">
        <Link href="/signup">{t('signUp')}</Link>
      </Button>
    </div>
  );
}
