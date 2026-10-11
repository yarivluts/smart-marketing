import * as React from 'react';
import { AlertTriangle, Info } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { cn } from '@/lib/utils';

/** One titled section of a guide, with an anchor id so the page can be linked to it. */
export function DocSection({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="flex scroll-mt-24 flex-col gap-pp-md">
      <h2 id={`${id}-title`} className="font-pp-display text-pp-headline-md text-pp-on-surface">
        <a href={`#${id}`} className="hover:underline">
          {title}
        </a>
      </h2>
      {children}
    </section>
  );
}

/** Body text of a guide: comfortable line length, logical alignment for RTL. */
export function DocText({ children, className }: { children: React.ReactNode; className?: string }): React.ReactElement {
  return <p className={cn('max-w-3xl text-pp-body-lg leading-7 text-pp-on-surface-variant', className)}>{children}</p>;
}

/** Inline code inside translated text (`t.rich(..., { code })`): always LTR. */
export function InlineCode({ children }: { children: React.ReactNode }): React.ReactElement {
  return (
    <code dir="ltr" className="rounded-md bg-pp-surface-container px-1.5 py-0.5 font-mono text-[0.9em] text-pp-on-surface [td_&]:whitespace-nowrap [td_&]:[overflow-wrap:normal]">
      {children}
    </code>
  );
}

/** Rich-text tag handlers shared by every guide's translated paragraphs. */
export const RICH = {
  code: (chunks: React.ReactNode) => <InlineCode>{chunks}</InlineCode>,
  strong: (chunks: React.ReactNode) => <strong className="font-semibold text-pp-on-surface">{chunks}</strong>,
};

export function Callout({
  tone = 'info',
  children,
}: {
  tone?: 'info' | 'warning';
  children: React.ReactNode;
}): React.ReactElement {
  const Icon = tone === 'warning' ? AlertTriangle : Info;
  return (
    <div
      className={cn(
        'flex max-w-3xl items-start gap-3 rounded-2xl p-pp-md text-pp-body-md',
        tone === 'warning' ? 'bg-pp-error-container/50 text-pp-on-error-container' : 'bg-pp-primary-fixed/60 text-pp-on-primary-fixed',
      )}
    >
      <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <div className="min-w-0">{children}</div>
    </div>
  );
}

/** A numbered or bulleted list of translated items. */
export function DocList({ items, ordered }: { items: React.ReactNode[]; ordered?: boolean }): React.ReactElement {
  const Tag = ordered ? 'ol' : 'ul';
  return (
    <Tag
      className={cn(
        'flex max-w-3xl flex-col gap-2 ps-6 text-pp-body-lg leading-7 text-pp-on-surface-variant',
        ordered ? 'list-decimal' : 'list-disc',
      )}
    >
      {items.map((item, index) => (
        <li key={index}>{item}</li>
      ))}
    </Tag>
  );
}

/** Previous / next guide links at the end of a page. */
export function GuidePager({
  previous,
  next,
  previousLabel,
  nextLabel,
}: {
  previous?: { href: string; title: string };
  next?: { href: string; title: string };
  previousLabel: string;
  nextLabel: string;
}): React.ReactElement {
  return (
    <nav className="grid gap-pp-md border-t border-pp-outline-variant/30 pt-pp-lg sm:grid-cols-2">
      {previous ? (
        <Link href={previous.href} className="rounded-2xl bg-pp-surface-container-lowest p-pp-md shadow-pp-candy hover:shadow-pp-candy-hover">
          <span className="block text-pp-label-sm uppercase tracking-wider text-pp-outline">{previousLabel}</span>
          <span className="font-pp-display text-pp-headline-md text-pp-on-surface">{previous.title}</span>
        </Link>
      ) : (
        <span />
      )}
      {next ? (
        <Link
          href={next.href}
          className="rounded-2xl bg-pp-surface-container-lowest p-pp-md text-end shadow-pp-candy hover:shadow-pp-candy-hover"
        >
          <span className="block text-pp-label-sm uppercase tracking-wider text-pp-outline">{nextLabel}</span>
          <span className="font-pp-display text-pp-headline-md text-pp-on-surface">{next.title}</span>
        </Link>
      ) : null}
    </nav>
  );
}
