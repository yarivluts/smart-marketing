import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Button } from '@/components/ui/button';
import { LocaleSwitcher } from '@/components/locale-switcher';

type PageProps = Readonly<{
  params: Promise<{ locale: string }>;
}>;

export default async function HomePage({ params }: PageProps): Promise<React.ReactElement> {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('HomePage');

  return (
    <main className="container flex min-h-screen flex-col items-center justify-center gap-6 py-16 text-center">
      <LocaleSwitcher />
      <h1 className="text-4xl font-bold tracking-tight">{t('title')}</h1>
      <p className="max-w-prose text-muted-foreground">{t('subtitle')}</p>
      <div className="flex gap-3">
        <Button>{t('getStarted')}</Button>
        <Button variant="outline">{t('viewDocs')}</Button>
      </div>
    </main>
  );
}
