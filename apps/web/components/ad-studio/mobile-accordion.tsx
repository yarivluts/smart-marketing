'use client';

import * as React from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface MobileAccordionItemProps {
  /** The one-line header shown on phones, collapsed or open (scene number, length, state). */
  summary: React.ReactNode;
  /** Open at first on phones; on wider screens the body is always shown. */
  defaultOpen?: boolean;
  /** Classes of the list item itself (border, padding, background). */
  className?: string;
  /** Classes of the body; it is hidden below the md breakpoint while collapsed. */
  bodyClassName?: string;
  /** Text for screen readers on the toggle, e.g. "Scene 2". */
  toggleLabel: string;
  testId?: string;
  onFocusCapture?: React.FocusEventHandler<HTMLLIElement>;
  children: React.ReactNode;
}

/**
 * A list item that is an accordion on phones and a plain card from the md breakpoint up: on a small
 * screen a long list of scenes collapses to one header line each, so the person opens only the scene
 * they work on; on desktop nothing changes.
 */
export function MobileAccordionItem({ summary, defaultOpen = false, className, bodyClassName, toggleLabel, testId, onFocusCapture, children }: MobileAccordionItemProps): React.ReactElement {
  const [open, setOpen] = React.useState(defaultOpen);
  const bodyId = React.useId();
  return (
    <li className={className} data-testid={testId} data-open={open} onFocusCapture={onFocusCapture}>
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        aria-controls={bodyId}
        aria-label={toggleLabel}
        className="flex w-full min-w-0 items-center gap-2 text-start md:hidden"
        data-testid={testId ? `${testId}-toggle` : undefined}
      >
        <span className="flex min-w-0 flex-1 flex-wrap items-center gap-2">{summary}</span>
        <ChevronDown className={cn('h-4 w-4 shrink-0 text-muted-foreground transition-transform', open && 'rotate-180')} aria-hidden="true" />
      </button>
      <div id={bodyId} className={cn(bodyClassName, !open && 'max-md:hidden', open && 'max-md:mt-3')}>
        {children}
      </div>
    </li>
  );
}
