export type AdStatusKey = 'statusActive' | 'statusPaused';

/** Maps the stored ad status (any casing, e.g. ACTIVE / enabled / PAUSED) to a translation key. */
export function adStatusKey(status: string | undefined): AdStatusKey | null {
  const value = status?.trim().toLowerCase();
  if (value === 'active' || value === 'enabled') return 'statusActive';
  if (value === 'paused' || value === 'disabled') return 'statusPaused';
  return null;
}
