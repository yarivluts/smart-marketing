import { useTranslations } from 'next-intl';
import { Network } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { LanguageSwitcher } from '@/components/shell/language-switcher';
import { InitialsAvatar } from '@/components/viz/initials-avatar';

/** The account pages' top bar (my account, notifications & app): brand home link, language, avatar. */
export function AccountHeader({ email }: { email: string }): React.ReactElement {
  const tShell = useTranslations('AppShell');
  return (
    <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center justify-between gap-pp-md border-b border-pp-outline-variant/30 bg-pp-surface-container-lowest/95 px-pp-md backdrop-blur lg:px-pp-lg">
      <Link href="/dashboard" className="flex shrink-0 items-center gap-pp-sm">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-pp-primary text-pp-on-primary shadow-sm shadow-pp-primary/30">
          <Network className="h-5 w-5" aria-hidden="true" />
        </span>
        <span className="font-pp-display text-pp-headline-md font-bold tracking-tight text-pp-primary">{tShell('brandName')}</span>
      </Link>
      <div className="flex shrink-0 items-center gap-pp-sm">
        <LanguageSwitcher compact />
        <InitialsAvatar name={email} seed={email} size="sm" />
      </div>
    </header>
  );
}
