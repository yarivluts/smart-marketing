import { useTranslations } from 'next-intl';

const STEPS = ['1', '2', '3'] as const;

/** The whole product in three steps: your website, the AI prepares, you approve. */
export function HomeSteps(): React.ReactElement {
  const t = useTranslations('HomePage');
  return (
    <section id="how" className="scroll-mt-20 bg-pp-surface-container-low py-16" aria-labelledby="home-how-title">
      <div className="mx-auto flex max-w-6xl flex-col gap-10 px-4 sm:px-6">
        <div className="flex max-w-2xl flex-col gap-2">
          <h2 id="home-how-title" className="text-balance font-pp-display text-pp-headline-lg-mobile sm:text-pp-headline-lg">
            {t('howTitle')}
          </h2>
          <p className="text-pp-body-lg text-pp-on-surface-variant">{t('howIntro')}</p>
        </div>
        <ol className="grid gap-5 md:grid-cols-3">
          {STEPS.map((step) => (
            <li key={step} className="flex flex-col gap-3 rounded-3xl bg-pp-surface-container-lowest p-6 shadow-pp-candy">
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-pp-primary font-pp-display text-pp-headline-md text-pp-on-primary">{step}</span>
              <h3 className="font-pp-display text-pp-headline-md">{t(`step${step}Title`)}</h3>
              <p className="text-pp-body-md text-pp-on-surface-variant">{t(`step${step}Body`)}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
