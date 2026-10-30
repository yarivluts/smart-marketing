import { useTranslations } from 'next-intl';
import { Bot, Clapperboard, Megaphone, Sparkles, type LucideIcon } from 'lucide-react';

const FEATURES: { key: string; icon: LucideIcon }[] = [
  { key: 'pilot', icon: Sparkles },
  { key: 'studio', icon: Clapperboard },
  { key: 'results', icon: Megaphone },
  { key: 'helper', icon: Bot },
];

/** The four modules a person meets inside, each in one plain sentence. */
export function HomeFeatures(): React.ReactElement {
  const t = useTranslations('HomePage');
  return (
    <section id="features" className="mx-auto flex max-w-6xl scroll-mt-20 flex-col gap-10 px-4 py-16 sm:px-6" aria-labelledby="home-features-title">
      <div className="flex max-w-2xl flex-col gap-2">
        <h2 id="home-features-title" className="text-balance font-pp-display text-pp-headline-lg-mobile sm:text-pp-headline-lg">
          {t('featuresTitle')}
        </h2>
        <p className="text-pp-body-lg text-pp-on-surface-variant">{t('featuresIntro')}</p>
      </div>
      <div className="grid gap-5 sm:grid-cols-2">
        {FEATURES.map(({ key, icon: Icon }) => (
          <article key={key} className="flex gap-4 rounded-3xl border border-pp-outline-variant/40 bg-pp-surface-container-lowest p-6">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-pp-primary-fixed text-pp-primary">
              <Icon className="h-6 w-6" aria-hidden="true" />
            </span>
            <div className="flex min-w-0 flex-col gap-1.5">
              <h3 className="font-pp-display text-pp-headline-md">{t(`feature.${key}.title`)}</h3>
              <p className="text-pp-body-md text-pp-on-surface-variant">{t(`feature.${key}.body`)}</p>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
