'use client';

import { useId } from 'react';
import type { Environment } from '@growthos/shared';
import { useRouter } from '@/i18n/navigation';
import { serializeEnvironmentCookie } from '@/lib/orgs/environment-selection';
import { cn } from '@/lib/utils';

export interface EnvironmentPickerProps {
  projectId: string;
  /** The environment names this project actually has, in display order. */
  options: readonly Environment[];
  /** The environment the current page's data is scoped to, or `null` for a project with none. */
  current: Environment | null;
  label: string;
  optionLabels: Record<Environment, string>;
  /** Shown whenever a non-prod environment is selected, so test data is never mistaken for live traffic. */
  nonProdNotice: string;
}

/** The selected pill's colour per environment: prod reads as the normal, calm state, and each non-prod environment gets its own loud colour. */
const SELECTED_CLASS: Record<Environment, string> = {
  prod: 'border-emerald-600 bg-emerald-600 text-white',
  staging: 'border-amber-500 bg-amber-500 text-white',
  dev: 'border-purple-600 bg-purple-600 text-white',
};

/**
 * The project shell's environment picker (KAN-196). Every project page's data reads are scoped to
 * the environment chosen here, `prod` by default. Selecting one records it in the project's
 * `gos_env_<projectId>` cookie and refreshes the current route, so the server components re-read
 * with the new scope without a full navigation.
 */
export function EnvironmentPicker({ projectId, options, current, label, optionLabels, nonProdNotice }: EnvironmentPickerProps): React.ReactElement | null {
  const router = useRouter();
  const labelId = useId();

  if (options.length === 0) {
    return null;
  }

  function select(environment: Environment): void {
    if (environment === current) {
      return;
    }
    document.cookie = serializeEnvironmentCookie(projectId, environment);
    router.refresh();
  }

  const isNonProd = current !== null && current !== 'prod';

  return (
    <div className="flex flex-col gap-2 px-3" data-environment={current ?? undefined}>
      <span id={labelId} className="text-xs font-medium text-muted-foreground">
        {label}
      </span>
      <div role="radiogroup" aria-labelledby={labelId} className="flex flex-wrap gap-1.5">
        {options.map((environment) => {
          const isSelected = environment === current;
          return (
            <button
              key={environment}
              type="button"
              role="radio"
              aria-checked={isSelected}
              onClick={() => select(environment)}
              className={cn(
                'rounded-full border px-3 py-1 text-xs font-semibold uppercase transition-colors',
                isSelected ? SELECTED_CLASS[environment] : 'border-input bg-transparent text-muted-foreground hover:bg-accent',
              )}
            >
              {optionLabels[environment]}
            </button>
          );
        })}
      </div>
      {isNonProd ? (
        <p
          role="status"
          className={cn(
            'rounded-md border px-2 py-1 text-xs font-medium',
            current === 'dev'
              ? 'border-purple-300 bg-purple-50 text-purple-800 dark:border-purple-800 dark:bg-purple-950/50 dark:text-purple-200'
              : 'border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-200',
          )}
        >
          {nonProdNotice}
        </p>
      ) : null}
    </div>
  );
}
