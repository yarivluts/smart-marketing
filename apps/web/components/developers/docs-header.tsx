import { getTranslations } from 'next-intl/server';
import { Code2, Network } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { LanguageSwitcher } from '@/components/shell/language-switcher';

/** The Developers area's top bar: brand, area badge, language and a sign-in / open-the-app button. */
export async function DocsHeader({ signedIn }: { signedIn: boolean }): Promise<React.ReactElement> {
  const t = await getTranslations('Developers');
  return (
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-pp-md border-b border-pp-outline-variant/30 bg-pp-surface-container-lowest/95 px-pp-md backdrop-blur lg:px-pp-lg">
      <div className="flex min-w-0 items-center gap-pp-md">
        <Link href="/" className="flex shrink-0 items-center gap-pp-sm">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-pp-primary text-pp-on-primary shadow-sm shadow-pp-primary/30">
            <Network className="h-5 w-5" aria-hidden="true" />
          </span>
          <span className="hidden font-pp-display text-pp-headline-md font-bold tracking-tight text-pp-primary sm:inline">
            {t('brand')}
          </span>
        </Link>
        <Link href="/developers" className="flex items-center gap-1.5 rounded-full bg-pp-primary-fixed px-3 py-1 text-pp-label-md text-pp-on-primary-fixed">
          <Code2 className="h-4 w-4" aria-hidden="true" />
          {t('nav.area')}
        </Link>
      </div>
      <div className="flex shrink-0 items-center gap-pp-sm">
        <LanguageSwitcher compact />
        <Link
          href={signedIn ? '/dashboard' : '/login'}
          className="rounded-full bg-primary px-4 py-2 text-pp-label-md font-semibold text-primary-foreground shadow-pp-candy hover:bg-pp-primary-container"
        >
          {signedIn ? t('nav.openApp') : t('nav.signIn')}
        </Link>
      </div>
    </header>
  );
}
