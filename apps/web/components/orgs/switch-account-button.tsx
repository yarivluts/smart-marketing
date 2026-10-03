'use client';

import { useTranslations } from 'next-intl';
import { LogOut } from 'lucide-react';
import { useRouter } from '@/i18n/navigation';
import { useAuth } from '@/lib/auth/auth-context';
import { PpButton } from '@/components/pastel/primitives';

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
    <PpButton size="sm" variant="secondary" onClick={handleClick}>
      <LogOut className="h-4 w-4 rtl:rotate-180" />
      <span>{t('switchAccount')}</span>
    </PpButton>
  );
}
