import { useTranslations } from 'next-intl';
import { ChevronDown } from 'lucide-react';
import { Link } from '@/i18n/navigation';

const QUESTIONS = ['knowledge', 'spend', 'platforms', 'developers'] as const;

/** The questions a newcomer asks before trying, answered truthfully. Native details: works without script. */
export function HomeFaq(): React.ReactElement {
  const t = useTranslations('HomePage');
  return (
    <section id="faq" className="mx-auto flex max-w-3xl scroll-mt-20 flex-col gap-6 px-4 py-16 sm:px-6" aria-labelledby="home-faq-title">
      <h2 id="home-faq-title" className="text-balance font-pp-display text-pp-headline-lg-mobile sm:text-pp-headline-lg">
        {t('faqTitle')}
      </h2>
      <div className="flex flex-col gap-3">
        {QUESTIONS.map((key) => (
          <details key={key} className="group rounded-2xl border border-pp-outline-variant/50 bg-pp-surface-container-lowest" data-testid={`home-faq-${key}`}>
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-4 text-pp-body-lg font-semibold [&::-webkit-details-marker]:hidden">
              {t(`faq.${key}.q`)}
              <ChevronDown className="h-5 w-5 shrink-0 text-pp-on-surface-variant transition-transform group-open:rotate-180" aria-hidden="true" />
            </summary>
            <p className="px-5 pb-5 text-pp-body-md text-pp-on-surface-variant">
              {t(`faq.${key}.a`)}
              {key === 'developers' ? (
                <>
                  {' '}
                  <Link href="/developers" className="font-semibold text-pp-primary hover:underline">
                    {t('faq.developers.link')}
                  </Link>
                </>
              ) : null}
            </p>
          </details>
        ))}
      </div>
    </section>
  );
}
