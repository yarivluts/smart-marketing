import * as React from 'react';
import { cn } from '@/lib/utils';
import { initialsFor, stableIndex } from '@/lib/orgs/workspace-view';
import { SERIES_COLORS } from './palette';

export interface InitialsAvatarProps {
  /** A display name or email - the initials are taken from it. */
  name: string;
  /** What picks the colour; defaults to `name`, so the same person always gets the same colour. */
  seed?: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const SIZES = {
  sm: 'h-7 w-7 text-[11px]',
  md: 'h-9 w-9 text-xs',
  lg: 'h-12 w-12 text-sm',
} as const;

/**
 * A round initials avatar for people, orgs and projects. The colour comes from the chart series
 * tokens (so it follows the theme) and is stable per seed. Decorative: the name it stands for is
 * always printed next to it, so it is hidden from screen readers.
 */
export function InitialsAvatar({ name, seed, size = 'md', className }: InitialsAvatarProps): React.ReactElement {
  const color = SERIES_COLORS[stableIndex(seed ?? name, SERIES_COLORS.length)];
  // A tint of the colour behind the colour itself reads well in light and dark themes alike.
  const tint = color.replace(/\)$/, ' / 0.16)');
  return (
    <span
      aria-hidden="true"
      data-testid="initials-avatar"
      className={cn('inline-flex shrink-0 select-none items-center justify-center rounded-full font-semibold ring-1 ring-inset ring-border/60', SIZES[size], className)}
      style={{ backgroundColor: tint, color }}
    >
      {initialsFor(name)}
    </span>
  );
}
