import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { LocaleSwitcher } from '@/components/locale-switcher';
import { AccountLinks, Brand } from './home-header';

/** The closing invitation. */
export function HomeCta({ signedIn }: { signedIn: boolean }): React.ReactElement {
  const t = useTranslations('HomePage');
  return (
    <section className="mx-auto max-w-6xl px-4 pb-16 sm:px-6" aria-labelledby="home-cta-title">
      <div className="flex flex-col items-center gap-5 rounded-[2rem] bg-pp-primary-fixed px-6 py-12 text-center">
        <h2 id="home-cta-title" className="text-balance font-pp-display text-pp-headline-lg-mobile text-pp-on-primary-fixed sm:text-pp-headline-lg">
          {t('ctaTitle')}
        </h2>
        <p className="max-w-xl text-pp-body-lg text-pp-on-primary-fixed-variant">{t('ctaBody')}</p>
        <AccountLinks signedIn={signedIn} size="lg" />
      </div>
    </section>
  );
}

/** Brand, the pages anyone may open, and the language switch (the header hides it on phones). */
export function HomeFooter(): React.ReactElement {
  const t = useTranslations('HomePage');
  return (
    <footer className="border-t border-pp-outline-variant/40 bg-pp-surface-container-low">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-10 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <Brand />
        <nav aria-label={t('footerLabel')} className="flex flex-wrap items-center gap-x-6 gap-y-2 text-pp-body-md text-pp-on-surface-variant">
          <Link href="/privacy" className="hover:text-pp-primary">
            {t('footerPrivacy')}
          </Link>
          <Link href="/developers" className="hover:text-pp-primary">
            {t('footerDevelopers')}
          </Link>
          <Link href="/login" className="hover:text-pp-primary">
            {t('signIn')}
          </Link>
        </nav>
        <LocaleSwitcher />
      </div>
    </footer>
  );
}
