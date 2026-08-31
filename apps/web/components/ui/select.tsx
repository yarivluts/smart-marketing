import * as React from 'react';
import { ChevronDown, Check } from 'lucide-react';
import { cn } from '@/lib/utils';

interface SelectContextValue {
  value: string;
  onValueChange: (value: string) => void;
  open: boolean;
  setOpen: React.Dispatch<React.SetStateAction<boolean>>;
  labelsMap: React.MutableRefObject<Map<string, React.ReactNode>>;
  registerLabel: (val: string, label: React.ReactNode) => void;
}

const SelectContext = React.createContext<SelectContextValue | null>(null);

function useSelectContext(): SelectContextValue {
  const context = React.useContext(SelectContext);
  if (!context) {
    throw new Error('Select subcomponents must be used within a <Select /> component');
  }
  return context;
}

export interface SelectProps {
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  children: React.ReactNode;
  disabled?: boolean;
}

export function Select({
  value: controlledValue,
  defaultValue = '',
  onValueChange,
  children,
}: SelectProps): React.ReactElement {
  const [uncontrolledValue, setUncontrolledValue] = React.useState(defaultValue);
  const [open, setOpen] = React.useState(false);
  const labelsMap = React.useRef<Map<string, React.ReactNode>>(new Map());
  const [, forceUpdate] = React.useReducer((x) => x + 1, 0);

  const isControlled = controlledValue !== undefined;
  const value = isControlled ? controlledValue : uncontrolledValue;

  const registerLabel = React.useCallback((val: string, label: React.ReactNode) => {
    if (labelsMap.current.get(val) !== label) {
      labelsMap.current.set(val, label);
      forceUpdate();
    }
  }, []);

  const handleValueChange = React.useCallback(
    (val: string) => {
      if (!isControlled) {
        setUncontrolledValue(val);
      }
      onValueChange?.(val);
      setOpen(false);
    },
    [isControlled, onValueChange],
  );

  return (
    <SelectContext.Provider value={{ value, onValueChange: handleValueChange, open, setOpen, labelsMap, registerLabel }}>
      <div className="relative inline-block w-full">{children}</div>
    </SelectContext.Provider>
  );
}

export type SelectTriggerProps = React.ButtonHTMLAttributes<HTMLButtonElement>;

export const SelectTrigger = React.forwardRef<HTMLButtonElement, SelectTriggerProps>(
  ({ className, children, ...props }, ref) => {
    const { open, setOpen } = useSelectContext();
    const triggerRef = React.useRef<HTMLButtonElement | null>(null);

    React.useImperativeHandle(ref, () => triggerRef.current as HTMLButtonElement);

    return (
      <button
        ref={triggerRef}
        type="button"
        role="combobox"
        aria-expanded={open}
        onClick={() => setOpen((prev) => !prev)}
        className={cn(
          'flex h-10 w-full items-center justify-between rounded-xl border border-input bg-background px-3.5 py-2 text-sm shadow-soft ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 transition-colors',
          className,
        )}
        {...props}
      >
        {children}
        <ChevronDown className={cn('h-4 w-4 shrink-0 opacity-50 transition-transform duration-200 ms-2', open && 'rotate-180')} />
      </button>
    );
  },
);
SelectTrigger.displayName = 'SelectTrigger';

export interface SelectValueProps {
  placeholder?: string;
  className?: string;
}

export function SelectValue({ placeholder = 'Select an option', className }: SelectValueProps): React.ReactElement {
  const { value, labelsMap } = useSelectContext();
  const label = value ? labelsMap.current.get(value) ?? value : null;

  return (
    <span className={cn('block truncate text-start', !label && 'text-muted-foreground', className)}>
      {label || placeholder}
    </span>
  );
}

export type SelectContentProps = React.HTMLAttributes<HTMLDivElement>;

export const SelectContent = React.forwardRef<HTMLDivElement, SelectContentProps>(
  ({ className, children, ...props }, ref) => {
    const { open, setOpen } = useSelectContext();
    const contentRef = React.useRef<HTMLDivElement | null>(null);

    React.useImperativeHandle(ref, () => contentRef.current as HTMLDivElement);

    React.useEffect(() => {
      if (!open) return;
      function handleClickOutside(e: MouseEvent) {
        if (contentRef.current && !contentRef.current.parentElement?.contains(e.target as Node)) {
          setOpen(false);
        }
      }
      function handleKeyDown(e: KeyboardEvent) {
        if (e.key === 'Escape') {
          setOpen(false);
        }
      }
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleKeyDown);
      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
        document.removeEventListener('keydown', handleKeyDown);
      };
    }, [open, setOpen]);

    return (
      <div
        ref={contentRef}
        role="listbox"
        className={cn(
          'absolute start-0 top-full z-50 mt-1.5 max-h-60 w-full min-w-[8rem] overflow-auto rounded-xl border border-border/80 bg-card p-1 text-card-foreground shadow-soft-lg animate-zoom-in-95 focus:outline-none',
          !open && 'hidden',
          className,
        )}
        {...props}
      >
        {children}
      </div>
    );
  },
);
SelectContent.displayName = 'SelectContent';

export interface SelectItemProps extends React.HTMLAttributes<HTMLDivElement> {
  value: string;
  disabled?: boolean;
}

export const SelectItem = React.forwardRef<HTMLDivElement, SelectItemProps>(
  ({ className, value, disabled = false, children, ...props }, ref) => {
    const { value: selectedValue, onValueChange, registerLabel } = useSelectContext();
    const isSelected = selectedValue === value;

    React.useEffect(() => {
      registerLabel(value, children);
    }, [value, children, registerLabel]);

    return (
      <div
        ref={ref}
        role="option"
        aria-selected={isSelected}
        data-selected={isSelected ? 'true' : undefined}
        onClick={() => {
          if (!disabled) {
            onValueChange(value);
          }
        }}
        className={cn(
          'relative flex w-full cursor-pointer select-none items-center justify-between rounded-lg px-3 py-2 text-sm outline-none transition-colors hover:bg-muted/80 focus:bg-muted',
          isSelected ? 'bg-primary/10 text-primary font-medium' : 'text-foreground',
          disabled && 'pointer-events-none opacity-50',
          className,
        )}
        {...props}
      >
        <span className="truncate">{children}</span>
        {isSelected ? <Check className="h-4 w-4 shrink-0 text-primary ms-2" /> : null}
      </div>
    );
  },
);
SelectItem.displayName = 'SelectItem';

export function SelectGroup({ className, ...props }: React.HTMLAttributes<HTMLDivElement>): React.ReactElement {
  return <div className={cn('p-1', className)} {...props} />;
}

export function SelectLabel({ className, ...props }: React.HTMLAttributes<HTMLDivElement>): React.ReactElement {
  return <div className={cn('px-3 py-1.5 text-xs font-semibold text-muted-foreground', className)} {...props} />;
}

export function SelectSeparator({ className, ...props }: React.HTMLAttributes<HTMLDivElement>): React.ReactElement {
  return <div className={cn('-mx-1 my-1 h-px bg-border', className)} {...props} />;
}
