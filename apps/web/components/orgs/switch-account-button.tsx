'use client';

import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { useAuth } from '@/lib/auth/auth-context';
import { Button } from '@/components/ui/button';

export interface SwitchAccountButtonProps {
  fromPath: string;
}

/** Signs the current user out and sends them back to /login, for the invite-email-mismatch case. */
export function SwitchAccountButton({ fromPath }: SwitchAccountButtonProps): React.ReactElement {
  const t = useTranslations('Invite');
  const router = useRouter();
  const { signOut } = useAuth();

  async function handleClick(): Promise<void> {
    await signOut();
    router.push({ pathname: '/login', query: { from: fromPath } });
  }

  return (
    <Button size="sm" variant="outline" onClick={handleClick}>
      {t('switchAccount')}
    </Button>
  );
}
