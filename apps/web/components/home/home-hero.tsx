import { useTranslations } from 'next-intl';
import { Check, Globe, Package, Sparkles, Wand2, X } from 'lucide-react';
import { AccountLinks } from './home-header';

/**
 * What a person does here, in one line, and the way in - beside a drawing of the product (the website
 * box and an approval card). The drawing is decoration, not data: it carries no numbers or claims.
 */
export function HomeHero({ signedIn }: { signedIn: boolean }): React.ReactElement {
  const t = useTranslations('HomePage');
  return (
    <section className="mx-auto grid max-w-6xl items-center gap-10 px-4 pb-16 pt-12 sm:px-6 lg:grid-cols-[1.1fr_1fr] lg:pt-20">
      <div className="flex flex-col gap-6">
        <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-pp-primary-fixed px-3 py-1 text-pp-label-md text-pp-on-primary-fixed-variant">
          <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
          {t('eyebrow')}
        </span>
        <h1 className="text-balance font-pp-display text-[34px] font-extrabold leading-[1.15] tracking-tight text-pp-on-surface sm:text-[46px]">{t('title')}</h1>
        <p className="max-w-xl text-pp-body-lg text-pp-on-surface-variant">{t('subtitle')}</p>
        <div className="flex flex-wrap items-center gap-3">
          <AccountLinks signedIn={signedIn} size="lg" />
          <a href="#how" className="inline-flex h-12 items-center justify-center rounded-full px-5 text-pp-body-lg font-semibold text-pp-primary hover:bg-pp-primary-fixed">
            {t('howItWorksLink')}
          </a>
        </div>
        <p className="text-pp-body-sm text-pp-on-surface-variant">{t('heroNote')}</p>
      </div>

      <div aria-hidden="true" className="relative min-w-0">
        <div className="absolute -inset-3 -z-10 sm:-inset-6 rounded-[2.5rem] bg-gradient-to-br from-pp-primary-fixed via-pp-secondary-fixed/60 to-transparent blur-2xl" />
        <div className="flex flex-col gap-4 rounded-3xl border border-pp-outline-variant/40 bg-pp-surface-container-lowest p-5 shadow-pp-candy">
          <div className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-pp-error/50" />
            <span className="h-2.5 w-2.5 rounded-full bg-pp-tertiary/50" />
            <span className="h-2.5 w-2.5 rounded-full bg-pp-primary/40" />
          </div>
          <div className="flex items-center gap-2 rounded-2xl border border-pp-outline-variant/60 bg-pp-background px-4 py-3">
            <Globe className="h-4 w-4 shrink-0 text-pp-primary" />
            <span className="min-w-0 truncate text-pp-body-md text-pp-on-surface" dir="ltr">
              {t('illustrationSite')}
            </span>
          </div>
          {[t('illustrationCard1'), t('illustrationCard2')].map((title, index) => (
            <div key={title} className="flex flex-col gap-3 rounded-2xl border border-pp-outline-variant/40 bg-pp-background p-4">
              <div className="flex items-center gap-2">
                <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-pp-primary-fixed text-pp-primary">
                  {index === 0 ? <Package className="h-4 w-4" /> : <Sparkles className="h-4 w-4" />}
                </span>
                <span className="text-pp-body-md font-semibold">{title}</span>
              </div>
              <div className="flex flex-wrap gap-2">
                <span className="inline-flex items-center gap-1 rounded-full bg-pp-primary px-3 py-1 text-pp-label-md text-pp-on-primary">
                  <Check className="h-3.5 w-3.5" />
                  {t('illustrationApprove')}
                </span>
                <span className="inline-flex items-center gap-1 rounded-full border border-pp-primary/40 px-3 py-1 text-pp-label-md text-pp-primary">
                  <Wand2 className="h-3.5 w-3.5" />
                  {t('illustrationChange')}
                </span>
                <span className="inline-flex items-center gap-1 px-2 py-1 text-pp-label-md text-pp-on-surface-variant">
                  <X className="h-3.5 w-3.5" />
                  {t('illustrationReject')}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
