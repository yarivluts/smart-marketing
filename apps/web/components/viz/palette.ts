/**
 * Series colours for every chart, drawn from the design tokens in `app/globals.css` so charts follow
 * the theme (light/dark) instead of hard-coding hex values. Order matters: the first series gets the
 * brand colour, and neighbouring series stay distinguishable.
 */
export const SERIES_COLORS = [
  'hsl(var(--primary))',
  'hsl(var(--info))',
  'hsl(var(--success))',
  'hsl(var(--warning))',
  'hsl(var(--destructive))',
  'hsl(268 75% 62%)',
  'hsl(330 81% 60%)',
  'hsl(173 80% 36%)',
] as const;

export function seriesColor(index: number, explicit?: string): string {
  return explicit ?? SERIES_COLORS[index % SERIES_COLORS.length];
}

export type VizStatus = 'ok' | 'warn' | 'error' | 'idle';

/** Token-based colours for a status, shared by badges, flow nodes and heatmap legends. */
export const STATUS_TOKENS: Record<VizStatus, { ring: string; dot: string; text: string; soft: string }> = {
  ok: { ring: 'ring-success/40', dot: 'bg-success', text: 'text-success', soft: 'bg-success/10' },
  warn: { ring: 'ring-warning/40', dot: 'bg-warning', text: 'text-warning', soft: 'bg-warning/10' },
  error: { ring: 'ring-destructive/40', dot: 'bg-destructive', text: 'text-destructive', soft: 'bg-destructive/10' },
  idle: { ring: 'ring-border', dot: 'bg-muted-foreground/50', text: 'text-muted-foreground', soft: 'bg-muted' },
};
