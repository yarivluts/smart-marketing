import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ChartSkeleton, Skeleton, StatCardSkeleton, TableRowSkeleton } from './skeleton';

describe('Skeleton', () => {
  it('renders base skeleton with pulse animation class', () => {
    render(<Skeleton className="h-6 w-20" />);
    expect(screen.getByTestId('skeleton')).toHaveClass('animate-pulse');
  });

  it('renders composite stat card and chart skeletons', () => {
    render(
      <div>
        <StatCardSkeleton />
        <ChartSkeleton />
      </div>,
    );
    expect(screen.getByTestId('stat-card-skeleton')).toBeInTheDocument();
    expect(screen.getByTestId('chart-skeleton')).toBeInTheDocument();
  });

  it('renders table row skeleton with specified column count', () => {
    render(
      <table>
        <tbody>
          <TableRowSkeleton columns={3} />
        </tbody>
      </table>,
    );
    expect(screen.getByTestId('table-row-skeleton').querySelectorAll('td')).toHaveLength(3);
  });
});
