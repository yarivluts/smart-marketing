import * as React from 'react';
import type { LucideIcon } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

export interface StatCardProps extends React.HTMLAttributes<HTMLDivElement> {
  title: string;
  value: string | number;
  change?: string | number;
  changeType?: 'increase' | 'decrease' | 'neutral';
  period?: string;
  icon?: LucideIcon | React.ComponentType<{ className?: string }>;
  badge?: React.ReactNode;
  targetHint?: string;
  progress?: number;
  trendData?: number[];
  subtext?: string;
}

export function StatCard({
  title,
  value,
  change,
  changeType,
  period,
  icon: Icon,
  badge,
  targetHint,
  progress,
  subtext,
  className,
  ...props
}: StatCardProps): React.ReactElement {
  // Infer changeType if not explicitly provided
  let resolvedChangeType = changeType;
  if (!resolvedChangeType && change !== undefined) {
    const numChange = typeof change === 'number' ? change : parseFloat(String(change).replace(/[^0-9.-]+/g, ''));
    if (!isNaN(numChange)) {
      resolvedChangeType = numChange > 0 ? 'increase' : numChange < 0 ? 'decrease' : 'neutral';
    } else {
      resolvedChangeType = 'neutral';
    }
  }

  const badgeVariant =
    resolvedChangeType === 'increase'
      ? 'success'
      : resolvedChangeType === 'decrease'
      ? 'destructive'
      : 'secondary';

  const trendIcon =
    resolvedChangeType === 'increase'
      ? 'up'
      : resolvedChangeType === 'decrease'
      ? 'down'
      : 'neutral';

  return (
    <Card
      hoverable
      className={cn('flex flex-col justify-between p-6 transition-all duration-200', className)}
      {...props}
    >
      <div>
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-medium text-muted-foreground truncate">{title}</span>
          <div className="flex items-center gap-1.5 shrink-0">
            {badge}
            {Icon ? (
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Icon className="h-5 w-5" />
              </div>
            ) : null}
          </div>
        </div>

        <div className="mt-3 flex items-baseline gap-2">
          <span dir="ltr" className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground inline-block">
            {value}
          </span>
        </div>
      </div>

      <div className="mt-4 flex flex-col gap-2">
        {progress !== undefined ? (
          <div className="w-full">
            <div className="h-2 w-full overflow-hidden rounded-full bg-secondary">
              <div
                className="h-full bg-emerald-gradient transition-all duration-500 rounded-full"
                style={{ width: `${Math.min(Math.max(progress, 0), 100)}%` }}
              />
            </div>
            {targetHint ? (
              <div className="mt-1 flex justify-between text-xs text-muted-foreground">
                <span>{targetHint}</span>
                <span dir="ltr">{progress}%</span>
              </div>
            ) : null}
          </div>
        ) : null}

        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          {change !== undefined ? (
            <Badge variant={badgeVariant} trend={trendIcon} size="sm" className="font-semibold">
              <span dir="ltr">{change}</span>
            </Badge>
          ) : null}
          {period ? <span>{period}</span> : null}
          {subtext ? <span className="text-muted-foreground/80">{subtext}</span> : null}
        </div>
      </div>
    </Card>
  );
}
