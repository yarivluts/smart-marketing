import * as React from 'react';
import { cn } from '@/lib/utils';

export interface LabelProps extends React.LabelHTMLAttributes<HTMLLabelElement> {
  required?: boolean;
}

const Label = React.forwardRef<HTMLLabelElement, LabelProps>(
  ({ className, required = false, children, ...props }, ref) => {
    return (
      <label
        ref={ref}
        className={cn(
          'text-sm font-medium leading-none text-foreground peer-disabled:cursor-not-allowed peer-disabled:opacity-70 inline-flex items-center gap-1 select-none',
          className,
        )}
        {...props}
      >
        {children}
        {required ? <span className="text-destructive">*</span> : null}
      </label>
    );
  },
);
Label.displayName = 'Label';

export { Label };
