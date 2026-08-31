import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center gap-1.5 rounded-full font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
  {
    variants: {
      variant: {
        default: 'bg-primary/10 text-primary border border-primary/20',
        secondary: 'bg-secondary text-secondary-foreground border border-border',
        success: 'bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-800',
        emerald: 'bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-800',
        warning: 'bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-950/50 dark:text-amber-300 dark:border-amber-800',
        amber: 'bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-950/50 dark:text-amber-300 dark:border-amber-800',
        destructive: 'bg-rose-50 text-rose-700 border border-rose-200 dark:bg-rose-950/50 dark:text-rose-300 dark:border-rose-800',
        alert: 'bg-rose-50 text-rose-700 border border-rose-200 dark:bg-rose-950/50 dark:text-rose-300 dark:border-rose-800',
        rose: 'bg-rose-50 text-rose-700 border border-rose-200 dark:bg-rose-950/50 dark:text-rose-300 dark:border-rose-800',
        info: 'bg-sky-50 text-sky-700 border border-sky-200 dark:bg-sky-950/50 dark:text-sky-300 dark:border-sky-800',
        purple: 'bg-purple-50 text-purple-700 border border-purple-200 dark:bg-purple-950/50 dark:text-purple-300 dark:border-purple-800',
        outline: 'border border-border text-foreground bg-transparent',
      },
      size: {
        default: 'px-2.5 py-0.5 text-xs',
        sm: 'px-2 py-0.2 text-[10px]',
        lg: 'px-3 py-1 text-sm font-semibold',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
);

const dotColors: Record<string, string> = {
  default: 'bg-primary',
  secondary: 'bg-muted-foreground',
  success: 'bg-emerald-500',
  emerald: 'bg-emerald-500',
  warning: 'bg-amber-500',
  amber: 'bg-amber-500',
  destructive: 'bg-rose-500',
  alert: 'bg-rose-500',
  rose: 'bg-rose-500',
  info: 'bg-sky-500',
  purple: 'bg-purple-500',
  outline: 'bg-muted-foreground',
};

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {
  dot?: boolean;
  trend?: 'up' | 'down' | 'neutral';
}

function Badge({
  className,
  variant = 'default',
  size = 'default',
  dot = false,
  trend,
  children,
  ...props
}: BadgeProps): React.ReactElement {
  const safeVariant = (variant ?? 'default') as string;
  const dotColor = dotColors[safeVariant] ?? 'bg-primary';

  return (
    <div className={cn(badgeVariants({ variant, size, className }))} {...props}>
      {dot ? (
        <span className="relative flex h-2 w-2 shrink-0">
          <span className={cn('absolute inline-flex h-full w-full animate-ping rounded-full opacity-75', dotColor)} />
          <span className={cn('relative inline-flex h-2 w-2 rounded-full', dotColor)} />
        </span>
      ) : null}
      {trend === 'up' ? (
        <TrendingUp className="h-3 w-3 shrink-0" aria-hidden="true" data-testid="trend-up" />
      ) : trend === 'down' ? (
        <TrendingDown className="h-3 w-3 shrink-0" aria-hidden="true" data-testid="trend-down" />
      ) : trend === 'neutral' ? (
        <Minus className="h-3 w-3 shrink-0" aria-hidden="true" data-testid="trend-neutral" />
      ) : null}
      {children}
    </div>
  );
}

export { Badge, badgeVariants };
