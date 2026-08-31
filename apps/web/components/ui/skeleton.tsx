import * as React from 'react';
import { cn } from '@/lib/utils';

export type SkeletonProps = React.HTMLAttributes<HTMLDivElement>;

function Skeleton({ className, ...props }: SkeletonProps): React.ReactElement {
  return (
    <div
      className={cn('animate-pulse rounded-xl bg-muted/80', className)}
      data-testid="skeleton"
      {...props}
    />
  );
}

function StatCardSkeleton({ className }: { className?: string }): React.ReactElement {
  return (
    <div
      className={cn(
        'flex flex-col justify-between rounded-2xl border border-border/80 bg-card p-6 shadow-soft',
        className,
      )}
      data-testid="stat-card-skeleton"
    >
      <div className="flex items-center justify-between">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-9 w-9 rounded-xl" />
      </div>
      <div className="mt-4">
        <Skeleton className="h-8 w-32" />
      </div>
      <div className="mt-4 flex items-center gap-2">
        <Skeleton className="h-5 w-16 rounded-full" />
        <Skeleton className="h-4 w-20" />
      </div>
    </div>
  );
}

function TableRowSkeleton({ columns = 4 }: { columns?: number }): React.ReactElement {
  return (
    <tr data-testid="table-row-skeleton" className="border-b border-border/60">
      {Array.from({ length: columns }).map((_, index) => (
        <td key={index} className="p-4">
          <Skeleton className="h-4 w-full max-w-[120px]" />
        </td>
      ))}
    </tr>
  );
}

function ChartSkeleton({ height = 240, className }: { height?: number; className?: string }): React.ReactElement {
  return (
    <div
      className={cn(
        'flex flex-col gap-3 rounded-2xl border border-border/80 bg-card p-6 shadow-soft',
        className,
      )}
      style={{ minHeight: height }}
      data-testid="chart-skeleton"
    >
      <div className="flex items-center justify-between">
        <Skeleton className="h-5 w-36" />
        <Skeleton className="h-8 w-24 rounded-lg" />
      </div>
      <div className="mt-4 flex flex-1 items-end gap-3 pb-2">
        {Array.from({ length: 7 }).map((_, i) => (
          <Skeleton
            key={i}
            className="flex-1 rounded-t-lg"
            style={{ height: `${25 + ((i * 17) % 65)}%` }}
          />
        ))}
      </div>
    </div>
  );
}

export { Skeleton, StatCardSkeleton, TableRowSkeleton, ChartSkeleton };
