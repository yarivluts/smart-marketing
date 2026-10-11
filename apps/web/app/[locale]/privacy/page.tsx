import { getTranslations, setRequestLocale } from 'next-intl/server';

type PageProps = Readonly<{
  params: Promise<{ locale: string }>;
}>;

export async function generateMetadata({ params }: PageProps) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'Privacy' });
  return { title: t('title') };
}

/** The sections in reading order; `deletion` carries the anchor Meta's app settings link to for data deletion instructions. */
const SECTIONS = ['collect', 'use', 'protect', 'share', 'deletion', 'contact', 'changes'] as const;

/**
 * GrowthOS's public privacy policy, linked from the Meta app (Privacy Policy URL and, via
 * `#data-deletion`, the data deletion instructions). Public: no sign-in, so the platforms and anyone
 * connecting an account can read it first.
 */
export default async function PrivacyPage({ params }: PageProps): Promise<React.ReactElement> {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('Privacy');
  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-8 px-4 py-12 sm:px-6">
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold">{t('title')}</h1>
        <p className="text-sm text-muted-foreground">{t('updated')}</p>
        <p className="leading-7">{t('intro')}</p>
      </header>
      {SECTIONS.map((section) => (
        <section key={section} id={section === 'deletion' ? 'data-deletion' : section} className="flex flex-col gap-2" data-testid={`privacy-${section}`}>
          <h2 className="text-xl font-semibold">{t(`${section}.title`)}</h2>
          <p className="leading-7">{t(`${section}.body`)}</p>
        </section>
      ))}
    </main>
  );
}
