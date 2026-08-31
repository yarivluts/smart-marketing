import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { CheckCircle2, AlertTriangle, AlertCircle, Info, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ToastItem } from './use-toast';

const toastVariants = cva(
  'pointer-events-auto relative flex w-full items-start gap-3 overflow-hidden rounded-2xl border p-4 shadow-soft-lg transition-all animate-slide-up duration-200',
  {
    variants: {
      variant: {
        default: 'border-border bg-card text-card-foreground',
        success: 'border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/90 dark:text-emerald-100',
        warning: 'border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950/90 dark:text-amber-100',
        destructive: 'border-rose-200 bg-rose-50 text-rose-900 dark:border-rose-800 dark:bg-rose-950/90 dark:text-rose-100',
        alert: 'border-rose-200 bg-rose-50 text-rose-900 dark:border-rose-800 dark:bg-rose-950/90 dark:text-rose-100',
        info: 'border-sky-200 bg-sky-50 text-sky-900 dark:border-sky-800 dark:bg-sky-950/90 dark:text-sky-100',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
);

const toastIcons = {
  default: null,
  success: <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600 dark:text-emerald-400 mt-0.5" />,
  warning: <AlertTriangle className="h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400 mt-0.5" />,
  destructive: <AlertCircle className="h-5 w-5 shrink-0 text-rose-600 dark:text-rose-400 mt-0.5" />,
  alert: <AlertCircle className="h-5 w-5 shrink-0 text-rose-600 dark:text-rose-400 mt-0.5" />,
  info: <Info className="h-5 w-5 shrink-0 text-sky-600 dark:text-sky-400 mt-0.5" />,
};

export interface ToastProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof toastVariants> {
  toast: ToastItem;
  onDismiss: () => void;
}

export function Toast({ toast: item, onDismiss, className, ...props }: ToastProps): React.ReactElement {
  const variant = item.variant ?? 'default';
  const icon = toastIcons[variant];

  return (
    <div
      role="alert"
      className={cn(toastVariants({ variant }), className)}
      {...props}
    >
      {icon}
      <div className="flex-1 min-w-0">
        {item.title ? (
          <div className="text-sm font-semibold leading-tight">{item.title}</div>
        ) : null}
        {item.description ? (
          <div className="mt-1 text-xs opacity-90 leading-relaxed">{item.description}</div>
        ) : null}
        {item.action ? (
          <button
            type="button"
            onClick={() => {
              item.action?.onClick();
              onDismiss();
            }}
            className="mt-2 rounded-lg bg-background/80 px-2.5 py-1 text-xs font-semibold shadow-sm hover:bg-background transition-colors"
          >
            {item.action.label}
          </button>
        ) : null}
      </div>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss notification"
        className="rounded-lg p-1 text-muted-foreground opacity-60 hover:opacity-100 hover:bg-black/5 dark:hover:bg-white/5 transition-all"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

export { toastVariants };
