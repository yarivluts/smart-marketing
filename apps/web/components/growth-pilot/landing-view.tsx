import type * as React from 'react';
import { Check } from 'lucide-react';
import type { GrowthLandingContent } from '@growthos/shared';
import { cn } from '@/lib/utils';

/**
 * A Growth Pilot landing page, drawn from its approved content: one audience, one action. The same
 * markup is the public page and the preview inside the app, so what the person approves is exactly
 * what visitors see. No scripts, no HTML from the model - only text in fixed places.
 */
export function GrowthLandingView({
  content,
  ctaUrl,
  dir,
  host,
  className,
}: {
  content: GrowthLandingContent;
  ctaUrl: string;
  dir: 'rtl' | 'ltr';
  /** The site's name in the footer ("easy-sign.co.il"). */
  host: string;
  className?: string;
}): React.ReactElement {
  const cta = (
    <a href={ctaUrl} className="inline-flex h-12 items-center justify-center rounded-full bg-[#5243d5] px-8 text-base font-semibold text-white shadow-lg shadow-[#5243d5]/25 transition hover:bg-[#4535c4]" data-testid="growth-landing-cta">
      {content.ctaText}
    </a>
  );
  return (
    <div dir={dir} className={cn('bg-[#f7f5fd] text-[#1e1e24]', className)} data-testid="growth-landing">
      <section className="bg-gradient-to-b from-white to-[#efecfb] px-6 pb-16 pt-14 text-center sm:pt-20">
        <div className="mx-auto flex max-w-3xl flex-col items-center gap-5">
          {content.eyebrow ? <span className="rounded-full bg-[#5243d5]/10 px-4 py-1 text-sm font-semibold text-[#5243d5]">{content.eyebrow}</span> : null}
          <h1 className="text-4xl font-extrabold leading-tight tracking-tight [text-wrap:balance] sm:text-5xl">{content.headline}</h1>
          {content.subheadline ? <p className="max-w-2xl text-lg leading-relaxed text-[#4a4757] [text-wrap:balance]">{content.subheadline}</p> : null}
          {cta}
        </div>
      </section>

      {content.benefits.length ? (
        <section className="px-6 py-14">
          <ul className="mx-auto grid max-w-5xl gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {content.benefits.map((benefit) => (
              <li key={benefit.title} className="flex gap-3 rounded-3xl bg-white p-6 shadow-sm">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#10b77f]/15 text-[#047857]">
                  <Check className="h-4 w-4" aria-hidden="true" />
                </span>
                <span className="flex flex-col gap-1">
                  <span className="text-base font-bold">{benefit.title}</span>
                  {benefit.text ? <span className="text-sm leading-relaxed text-[#4a4757]">{benefit.text}</span> : null}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {content.steps.length ? (
        <section className="px-6 pb-14">
          <ol className="mx-auto flex max-w-3xl flex-col gap-3">
            {content.steps.map((step, index) => (
              <li key={step} className="flex items-center gap-4 rounded-2xl bg-white p-4 shadow-sm">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#5243d5] text-sm font-bold text-white">{index + 1}</span>
                <span className="text-base">{step}</span>
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      {content.faq.length ? (
        <section className="px-6 pb-14">
          <div className="mx-auto flex max-w-3xl flex-col gap-2">
            {content.faq.map((item) => (
              <details key={item.question} className="group rounded-2xl bg-white p-4 shadow-sm">
                <summary className="cursor-pointer list-none text-base font-semibold marker:hidden">{item.question}</summary>
                <p className="pt-2 text-sm leading-relaxed text-[#4a4757]">{item.answer}</p>
              </details>
            ))}
          </div>
        </section>
      ) : null}

      <section className="bg-gradient-to-br from-[#5243d5] to-[#6b5fef] px-6 py-14 text-center text-white">
        <div className="mx-auto flex max-w-2xl flex-col items-center gap-5">
          <h2 className="text-3xl font-bold [text-wrap:balance]">{content.closingHeadline || content.headline}</h2>
          <a href={ctaUrl} className="inline-flex h-12 items-center justify-center rounded-full bg-white px-8 text-base font-semibold text-[#5243d5] transition hover:bg-white/90">
            {content.ctaText}
          </a>
        </div>
      </section>
      <footer className="px-6 py-6 text-center text-xs text-[#6f6c7a]" dir="ltr">
        {host}
      </footer>
    </div>
  );
}
