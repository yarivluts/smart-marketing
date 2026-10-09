import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Stitch "Pastel Pulse" building blocks (project 748986387566122661).
 *
 * Every converted page composes these instead of re-deriving the Stitch markup, so the
 * canonical look (candy-shadow white cards on the lavender canvas, Outfit headlines,
 * pill buttons, accent-bordered KPI tiles) stays identical across ~70 routes. All
 * components are server-compatible (no hooks) and use logical properties for RTL.
 */

export type PpAccent = 'primary' | 'mint' | 'amber' | 'sky' | 'pink' | 'error' | 'neutral';

const ACCENT_BORDER: Record<PpAccent, string> = {
  primary: 'border-s-pp-primary',
  mint: 'border-s-pp-secondary-fixed-dim',
  amber: 'border-s-amber-400',
  sky: 'border-s-sky-400',
  pink: 'border-s-pp-tertiary-fixed-dim',
  error: 'border-s-pp-error',
  neutral: 'border-s-pp-outline-variant',
};

const ACCENT_PILL: Record<PpAccent, string> = {
  primary: 'bg-pp-primary-fixed text-pp-on-primary-fixed',
  mint: 'bg-pp-secondary-container text-pp-on-secondary-container',
  amber: 'bg-amber-100 text-amber-900',
  sky: 'bg-sky-100 text-sky-900',
  pink: 'bg-pp-tertiary-fixed text-pp-on-tertiary-fixed',
  error: 'bg-pp-error-container text-pp-on-error-container',
  neutral: 'bg-pp-surface-container text-pp-on-surface-variant',
};

const ACCENT_DOT: Record<PpAccent, string> = {
  primary: 'bg-pp-primary',
  mint: 'bg-pp-secondary',
  amber: 'bg-amber-400',
  sky: 'bg-sky-500',
  pink: 'bg-pp-tertiary',
  error: 'bg-pp-error',
  neutral: 'bg-pp-outline',
};

const ACCENT_ICON_CHIP: Record<PpAccent, string> = {
  primary: 'bg-pp-primary-fixed text-pp-primary',
  mint: 'bg-pp-secondary-container/60 text-pp-secondary',
  amber: 'bg-amber-100 text-amber-700',
  sky: 'bg-sky-100 text-sky-700',
  pink: 'bg-pp-tertiary-fixed text-pp-tertiary',
  error: 'bg-pp-error-container text-pp-error',
  neutral: 'bg-pp-surface-container text-pp-on-surface-variant',
};

export function ppAccentPill(accent: PpAccent): string {
  return ACCENT_PILL[accent];
}

/* ------------------------------------------------------------------------------------------ */
/* Page frame                                                                                  */
/* ------------------------------------------------------------------------------------------ */

/**
 * Page content column: Stitch vertical rhythm (`space-y-pp-lg`), centred and width-capped.
 * The shell owns the page's single main landmark; this is a plain container inside it.
 */
export function PpPage({
  children,
  className,
  ...rest
}: React.HTMLAttributes<HTMLDivElement>): React.ReactElement {
  return (
    <div className={cn('mx-auto w-full max-w-[1600px] space-y-pp-lg text-pp-on-surface', className)} {...rest}>
      {children}
    </div>
  );
}

export interface PpPageHeaderProps {
  title: React.ReactNode;
  description?: React.ReactNode;
  /** Small uppercase pill above the title (e.g. "CORE CONFIGURATION"). */
  eyebrow?: React.ReactNode;
  /** Muted text beside the eyebrow (e.g. "Updated 14m ago"). */
  meta?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}

export function PpPageHeader({ title, description, eyebrow, meta, actions, className }: PpPageHeaderProps): React.ReactElement {
  return (
    <header className={cn('flex flex-col justify-between gap-4 md:flex-row md:items-center', className)}>
      <div className="min-w-0">
        {eyebrow || meta ? (
          <div className="mb-1 flex flex-wrap items-center gap-2">
            {eyebrow ? (
              <span className="rounded-full bg-pp-primary-fixed px-2.5 py-0.5 text-pp-label-sm uppercase tracking-wider text-pp-on-primary-fixed">
                {eyebrow}
              </span>
            ) : null}
            {meta ? <span className="text-pp-label-sm text-pp-outline">{meta}</span> : null}
          </div>
        ) : null}
        <h1 className="font-pp-display text-pp-headline-xl-mobile tracking-tight text-pp-on-surface md:text-pp-headline-xl">
          {title}
        </h1>
        {description ? <p className="mt-1 max-w-3xl text-pp-body-md text-pp-on-surface-variant">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-3">{actions}</div> : null}
    </header>
  );
}

/* ------------------------------------------------------------------------------------------ */
/* Buttons & pills                                                                             */
/* ------------------------------------------------------------------------------------------ */

type PpButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'obsidian';

const BUTTON_VARIANTS: Record<PpButtonVariant, string> = {
  primary: 'bg-pp-primary text-pp-on-primary hover:bg-pp-primary-container shadow-pp-candy',
  secondary: 'bg-pp-surface-container-lowest text-pp-on-surface hover:bg-pp-surface-container shadow-pp-candy',
  ghost: 'text-pp-on-surface-variant hover:bg-pp-surface-container hover:text-pp-on-surface',
  danger: 'bg-pp-error-container text-pp-on-error-container hover:bg-pp-error hover:text-pp-on-error',
  obsidian: 'bg-pp-obsidian text-white hover:bg-pp-inverse-surface shadow-pp-candy',
};

export interface PpButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: PpButtonVariant;
  size?: 'sm' | 'md';
  icon?: LucideIcon;
  asChild?: boolean;
}

export const PpButton = React.forwardRef<HTMLButtonElement, PpButtonProps>(function PpButton(
  { variant = 'primary', size = 'md', icon: Icon, asChild, className, children, type, ...rest },
  ref,
) {
  const Comp = asChild ? Slot : 'button';
  return (
    <Comp
      ref={ref}
      type={asChild ? undefined : (type ?? 'button')}
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-full font-pp-body text-pp-label-md transition-all duration-150 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pp-primary/40',
        size === 'sm' ? 'px-3 py-1.5' : 'px-4 py-2',
        BUTTON_VARIANTS[variant],
        className,
      )}
      {...rest}
    >
      {asChild ? (
        children
      ) : (
        <>
          {Icon ? <Icon className="h-[18px] w-[18px] shrink-0" aria-hidden /> : null}
          {children}
        </>
      )}
    </Comp>
  );
});

export function PpPill({
  accent = 'neutral',
  dot,
  children,
  className,
}: {
  accent?: PpAccent;
  dot?: boolean;
  children: React.ReactNode;
  className?: string;
}): React.ReactElement {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-bold',
        ACCENT_PILL[accent],
        className,
      )}
    >
      {dot ? <span className={cn('h-1.5 w-1.5 rounded-full', ACCENT_DOT[accent])} aria-hidden /> : null}
      {children}
    </span>
  );
}

export function PpIconChip({
  icon: Icon,
  accent = 'primary',
  size = 'md',
  className,
}: {
  icon: LucideIcon;
  accent?: PpAccent;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}): React.ReactElement {
  const box = size === 'sm' ? 'h-8 w-8 rounded-xl' : size === 'lg' ? 'h-12 w-12 rounded-2xl' : 'h-10 w-10 rounded-xl';
  const glyph = size === 'sm' ? 'h-4 w-4' : size === 'lg' ? 'h-6 w-6' : 'h-5 w-5';
  return (
    <span className={cn('inline-flex shrink-0 items-center justify-center', box, ACCENT_ICON_CHIP[accent], className)}>
      <Icon className={glyph} aria-hidden />
    </span>
  );
}

/* ------------------------------------------------------------------------------------------ */
/* Cards                                                                                       */
/* ------------------------------------------------------------------------------------------ */

export interface PpCardProps extends Omit<React.HTMLAttributes<HTMLElement>, 'title'> {
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  icon?: LucideIcon;
  iconAccent?: PpAccent;
  /** Right-aligned header slot (pill, link, button). */
  action?: React.ReactNode;
  /** Removes inner padding from the body (for edge-to-edge tables). */
  flush?: boolean;
  as?: 'section' | 'div' | 'article';
}

export function PpCard({
  title,
  subtitle,
  icon,
  iconAccent = 'primary',
  action,
  flush,
  as: Tag = 'section',
  className,
  children,
  ...rest
}: PpCardProps): React.ReactElement {
  const hasHeader = Boolean(title || subtitle || icon || action);
  return (
    <Tag
      className={cn('rounded-2xl bg-pp-surface-container-lowest text-pp-on-surface shadow-pp-candy', className)}
      {...rest}
    >
      {hasHeader ? (
        <div className={cn('flex items-start justify-between gap-3', flush ? 'p-pp-lg pb-pp-md' : 'px-pp-lg pt-pp-lg')}>
          <div className="flex min-w-0 items-start gap-3">
            {icon ? <PpIconChip icon={icon} accent={iconAccent} /> : null}
            <div className="min-w-0">
              {title ? <h2 className="font-pp-display text-pp-headline-md text-pp-on-surface">{title}</h2> : null}
              {subtitle ? <p className="mt-0.5 text-pp-body-sm text-pp-on-surface-variant">{subtitle}</p> : null}
            </div>
          </div>
          {action ? <div className="flex shrink-0 items-center gap-2">{action}</div> : null}
        </div>
      ) : null}
      <div className={cn(flush ? '' : hasHeader ? 'p-pp-lg pt-pp-md' : 'p-pp-lg')}>{children}</div>
    </Tag>
  );
}

export interface PpKpiCardProps {
  label: React.ReactNode;
  value: React.ReactNode;
  /** Smaller trailing value text, e.g. "/ 25". */
  valueSuffix?: React.ReactNode;
  badge?: React.ReactNode;
  badgeAccent?: PpAccent;
  accent?: PpAccent;
  /** Footer row under the value (text, link, or progress). */
  footer?: React.ReactNode;
  /** 0–100; renders the Stitch progress track under the value. */
  progress?: number;
  className?: string;
}

export function PpKpiCard({
  label,
  value,
  valueSuffix,
  badge,
  badgeAccent,
  accent = 'primary',
  footer,
  progress,
  className,
}: PpKpiCardProps): React.ReactElement {
  return (
    <div
      className={cn(
        'rounded-2xl border-s-4 bg-pp-surface-container-lowest p-pp-lg shadow-pp-candy transition-all duration-200 hover:shadow-pp-candy-hover',
        ACCENT_BORDER[accent],
        className,
      )}
    >
      <div className="mb-2 flex items-start justify-between gap-2">
        <span className="text-pp-label-sm uppercase tracking-wider text-pp-outline">{label}</span>
        {badge ? <PpPill accent={badgeAccent ?? accent}>{badge}</PpPill> : null}
      </div>
      <div className="mt-1 font-pp-display text-pp-metric text-pp-on-surface" dir="auto">
        {value}
        {valueSuffix ? <span className="ms-1 text-pp-headline-md text-pp-outline">{valueSuffix}</span> : null}
      </div>
      {typeof progress === 'number' ? (
        <div
          className="mt-3 h-2 w-full overflow-hidden rounded-full bg-pp-surface-container"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(progress)}
        >
          <div
            className={cn('h-full rounded-full', ACCENT_DOT[accent])}
            style={{ width: `${Math.max(0, Math.min(100, progress))}%` }}
          />
        </div>
      ) : null}
      {footer ? <div className="mt-3 text-pp-body-sm text-pp-on-surface-variant">{footer}</div> : null}
    </div>
  );
}

/** Responsive KPI row: 1 col mobile → 2 → 4 on desktop (Stitch default). */
export function PpKpiGrid({ children, className }: { children: React.ReactNode; className?: string }): React.ReactElement {
  return <div className={cn('grid grid-cols-1 gap-pp-md sm:grid-cols-2 lg:grid-cols-4', className)}>{children}</div>;
}

/* ------------------------------------------------------------------------------------------ */
/* Lists, tables, empty states                                                                 */
/* ------------------------------------------------------------------------------------------ */

/** Subtle inset row used inside cards (Stitch `.subtle-inset` list items). */
export function PpInsetRow({
  children,
  className,
  ...rest
}: React.HTMLAttributes<HTMLDivElement>): React.ReactElement {
  return (
    <div
      className={cn('flex items-center justify-between gap-3 rounded-2xl bg-pp-subtle-inset px-pp-md py-3', className)}
      {...rest}
    >
      {children}
    </div>
  );
}

/** Table wrapper: horizontal scroll on mobile, Stitch header styling. Use plain <table> inside. */
export function PpTable({ children, className }: { children: React.ReactNode; className?: string }): React.ReactElement {
  return (
    <div className={cn('-mx-pp-lg overflow-x-auto px-pp-lg', className)}>
      <table className="w-full min-w-[640px] border-separate border-spacing-y-1 text-start text-pp-body-md [&_td]:px-3 [&_td]:py-3 [&_th]:px-3 [&_th]:pb-2 [&_th]:text-start [&_th]:text-pp-label-sm [&_th]:uppercase [&_th]:tracking-wider [&_th]:text-pp-outline [&_tbody_tr]:bg-pp-surface-container-low/60 [&_tbody_tr:hover]:bg-pp-surface-container [&_tbody_td:first-child]:rounded-s-xl [&_tbody_td:last-child]:rounded-e-xl">
        {children}
      </table>
    </div>
  );
}

export function PpEmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: LucideIcon;
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}): React.ReactElement {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-pp-outline-variant bg-pp-surface-container-low/60 px-pp-lg py-pp-xl text-center',
        className,
      )}
    >
      {icon ? <PpIconChip icon={icon} accent="primary" size="lg" /> : null}
      <div className="font-pp-display text-pp-headline-md text-pp-on-surface">{title}</div>
      {description ? <p className="max-w-md text-pp-body-md text-pp-on-surface-variant">{description}</p> : null}
      {action ? <div className="mt-1 flex flex-wrap justify-center gap-2">{action}</div> : null}
    </div>
  );
}

/** Small uppercase section label used between groups inside a card. */
export function PpSectionLabel({ children, className }: { children: React.ReactNode; className?: string }): React.ReactElement {
  return <div className={cn('mb-2 text-pp-label-sm uppercase tracking-wider text-pp-outline', className)}>{children}</div>;
}

/**
 * Mobile-only sticky action bar that sits above the obsidian bottom dock (88px) — the Stitch
 * mobile designs put primary page actions here instead of in the header.
 */
export function PpMobileActionBar({ children, className }: { children: React.ReactNode; className?: string }): React.ReactElement {
  return (
    <div
      className={cn(
        'fixed inset-x-0 bottom-[96px] z-30 mx-pp-margin-mobile flex items-center gap-2 rounded-full bg-pp-surface-container-lowest/95 p-1.5 shadow-pp-candy-hover backdrop-blur lg:hidden',
        className,
      )}
    >
      {children}
    </div>
  );
}

/** Form field shell matching Stitch inputs (label above, pill-ish inset input). */
export const ppInputClass =
  'w-full rounded-2xl border-none bg-pp-surface-container px-4 py-2.5 text-pp-body-md text-pp-on-surface placeholder:text-pp-outline focus:bg-pp-surface-container-lowest focus:outline-none focus:ring-2 focus:ring-pp-primary/40 transition-all duration-150';

export function PpField({
  label,
  htmlFor,
  hint,
  children,
  className,
}: {
  label: React.ReactNode;
  htmlFor?: string;
  hint?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}): React.ReactElement {
  return (
    <div className={cn('space-y-1.5', className)}>
      <label htmlFor={htmlFor} className="block text-pp-label-md text-pp-on-surface">
        {label}
      </label>
      {children}
      {hint ? <p className="text-pp-body-sm text-pp-on-surface-variant">{hint}</p> : null}
    </div>
  );
}
