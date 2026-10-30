import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';

/** A mistyped or moved address explains itself and offers the way back. */
export default function LocaleNotFound(): React.ReactElement {
  const t = useTranslations('ErrorPage');

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-4 px-4 text-center">
      <h1 className="text-2xl font-semibold">{t('notFoundTitle')}</h1>
      <p className="text-muted-foreground">{t('notFoundBody')}</p>
      <Link href="/" className="rounded-md bg-primary px-4 py-2 text-primary-foreground">
        {t('home')}
      </Link>
    </main>
  );
}
