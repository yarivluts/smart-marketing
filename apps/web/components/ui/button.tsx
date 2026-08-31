import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center whitespace-nowrap rounded-xl text-sm font-medium transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50 active:scale-[0.98]',
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground shadow-soft hover:bg-primary/90 hover:shadow-soft-md hover:-translate-y-0.5',
        brand: 'bg-brand-gradient text-primary-foreground shadow-soft hover:shadow-glow hover:-translate-y-0.5',
        destructive: 'bg-destructive text-destructive-foreground shadow-soft hover:bg-destructive/90 hover:shadow-soft-md',
        outline: 'border border-input bg-background shadow-soft hover:bg-muted/80 hover:border-accent hover:text-accent-foreground',
        secondary: 'bg-secondary text-secondary-foreground shadow-soft hover:bg-secondary/80',
        ghost: 'hover:bg-muted hover:text-foreground',
        link: 'text-primary underline-offset-4 hover:underline p-0 h-auto',
        success: 'bg-success text-success-foreground shadow-soft hover:bg-success/90 hover:shadow-glow-emerald',
        emerald: 'bg-emerald-600 text-white shadow-soft hover:bg-emerald-700 hover:shadow-glow-emerald',
        warning: 'bg-warning text-warning-foreground shadow-soft hover:bg-warning/90',
      },
      size: {
        default: 'h-10 px-4 py-2',
        sm: 'h-8 rounded-lg px-3 text-xs',
        lg: 'h-12 rounded-xl px-8 text-base',
        icon: 'h-10 w-10 p-0',
        'icon-sm': 'h-8 w-8 p-0 rounded-lg',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  isLoading?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, isLoading = false, leftIcon, rightIcon, children, disabled, ...props }, ref) => {
    if (asChild) {
      return (
        <Slot className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props}>
          {children}
        </Slot>
      );
    }

    return (
      <button
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        disabled={disabled || isLoading}
        aria-busy={isLoading}
        {...props}
      >
        {isLoading ? (
          <Loader2 className="h-4 w-4 animate-spin me-2" aria-hidden="true" data-testid="button-spinner" />
        ) : leftIcon ? (
          <span className="me-2 inline-flex shrink-0">{leftIcon}</span>
        ) : null}
        {children}
        {!isLoading && rightIcon ? (
          <span className="ms-2 inline-flex shrink-0">{rightIcon}</span>
        ) : null}
      </button>
    );
  },
);
Button.displayName = 'Button';

export { Button, buttonVariants };
