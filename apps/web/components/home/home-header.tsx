import { useTranslations } from 'next-intl';
import { Network } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { LocaleSwitcher } from '@/components/locale-switcher';

/** The way in: a signed-in visitor goes to their account, anyone else can sign in or start free. */
export function AccountLinks({ signedIn, size = 'md' }: { signedIn: boolean; size?: 'md' | 'lg' }): React.ReactElement {
  const t = useTranslations('HomePage');
  const primary =
    size === 'lg'
      ? 'inline-flex h-12 items-center justify-center rounded-full bg-pp-primary px-7 text-pp-body-lg font-semibold text-pp-on-primary shadow-pp-candy transition-colors hover:bg-pp-primary/90'
      : 'inline-flex h-10 items-center justify-center rounded-full bg-pp-primary px-5 text-pp-label-md text-pp-on-primary shadow-pp-candy transition-colors hover:bg-pp-primary/90';
  if (signedIn) {
    return (
      <Link href="/start" className={primary} data-testid="home-account">
        {t('goToAccount')}
      </Link>
    );
  }
  return (
    <div className="flex items-center gap-2">
      {size === 'md' ? (
        <Link href="/login" className="inline-flex h-10 items-center justify-center rounded-full border border-pp-outline-variant px-4 text-pp-label-md text-pp-on-surface transition-colors hover:bg-pp-surface-container-high" data-testid="home-login">
          {t('signIn')}
        </Link>
      ) : null}
      <Link href="/signup" className={primary} data-testid="home-signup">
        {t('startFree')}
      </Link>
    </div>
  );
}

export function Brand(): React.ReactElement {
  return (
    <span className="flex items-center gap-2">
      <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-pp-primary text-pp-on-primary shadow-sm shadow-pp-primary/30">
        <Network className="h-5 w-5" aria-hidden="true" />
      </span>
      <span className="font-pp-display text-pp-headline-md font-bold tracking-tight text-pp-primary">GrowthOS</span>
    </span>
  );
}

export function HomeHeader({ signedIn }: { signedIn: boolean }): React.ReactElement {
  const t = useTranslations('HomePage');
  return (
    <header className="sticky top-0 z-30 border-b border-pp-outline-variant/40 bg-pp-background/90 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
        <Link href="/" aria-label="GrowthOS">
          <Brand />
        </Link>
        <nav aria-label={t('navLabel')} className="hidden items-center gap-6 text-pp-body-md text-pp-on-surface-variant md:flex">
          <a href="#how" className="hover:text-pp-primary">
            {t('navHow')}
          </a>
          <a href="#features" className="hover:text-pp-primary">
            {t('navFeatures')}
          </a>
          <a href="#faq" className="hover:text-pp-primary">
            {t('navFaq')}
          </a>
        </nav>
        <div className="flex items-center gap-2">
          <div className="hidden sm:block">
            <LocaleSwitcher />
          </div>
          <AccountLinks signedIn={signedIn} />
        </div>
      </div>
    </header>
  );
}
