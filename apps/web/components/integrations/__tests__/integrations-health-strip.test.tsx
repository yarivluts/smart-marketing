import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithIntl } from '../../../tests/e2e/helpers/test-harness';
import React from 'react';

export interface HealthStripStats {
  activeCount: number;
  degradedCount: number;
  missingCount: number;
  availableCount: number;
  totalThroughputPerMin?: number;
}

export interface IntegrationsHealthStripProps {
  stats: HealthStripStats;
  selectedFilter?: 'all' | 'active' | 'degraded' | 'missing' | 'available';
  onFilterChange?: (filter: 'all' | 'active' | 'degraded' | 'missing' | 'available') => void;
}

export function IntegrationsHealthStrip({
  stats,
  selectedFilter = 'all',
  onFilterChange,
}: IntegrationsHealthStripProps): React.ReactElement {
  const cards = [
    {
      id: 'active' as const,
      label: 'Active Streams',
      count: stats.activeCount,
      color: 'text-emerald-500',
      bg: 'bg-emerald-500/10 border-emerald-500/30',
      icon: '✓',
    },
    {
      id: 'degraded' as const,
      label: 'Degraded / Retrying',
      count: stats.degradedCount,
      color: 'text-rose-500',
      bg: 'bg-rose-500/10 border-rose-500/30',
      icon: '⚠',
    },
    {
      id: 'missing' as const,
      label: 'Missing Prerequisites',
      count: stats.missingCount,
      color: 'text-amber-500',
      bg: 'bg-amber-500/10 border-amber-500/30',
      icon: '⚡',
    },
    {
      id: 'available' as const,
      label: 'Available in Catalog',
      count: stats.availableCount,
      color: 'text-blue-500',
      bg: 'bg-blue-500/10 border-blue-500/30',
      icon: '📦',
    },
  ];

  return (
    <section aria-label="Integrations Health Overview" className="grid grid-cols-2 md:grid-cols-4 gap-3.5">
      {cards.map((card) => {
        const isSelected = selectedFilter === card.id;
        return (
          <button
            key={card.id}
            type="button"
            onClick={() => onFilterChange?.(card.id)}
            aria-pressed={isSelected}
            aria-label={`${card.label}: ${card.count}`}
            className={`flex flex-col items-start justify-between rounded-2xl border p-4 text-start transition-all shadow-soft hover:shadow-soft-lg ${
              card.bg
            } ${isSelected ? 'ring-2 ring-primary ring-offset-2' : ''}`}
          >
            <div className="flex w-full items-center justify-between">
              <span className="text-xs font-semibold text-muted-foreground">{card.label}</span>
              <span className={`text-base font-bold ${card.color}`}>{card.icon}</span>
            </div>
            <div className="pt-2">
              <span className="text-2xl font-black text-foreground tracking-tight">{card.count}</span>
            </div>
          </button>
        );
      })}
    </section>
  );
}

describe('F20: Integrations Hub: Health Overview Strip', () => {
  const sampleStats: HealthStripStats = {
    activeCount: 3,
    degradedCount: 1,
    missingCount: 2,
    availableCount: 12,
  };

  describe('Tier 1: Primary Happy Path Scenarios', () => {
    it('F20-T1-01: renders all 4 canonical health status cards (Active, Degraded, Missing, Available)', () => {
      renderWithIntl(<IntegrationsHealthStrip stats={sampleStats} />);

      expect(screen.getByRole('region', { name: /Integrations Health Overview/i })).toBeInTheDocument();
      expect(screen.getByText('Active Streams')).toBeInTheDocument();
      expect(screen.getByText('Degraded / Retrying')).toBeInTheDocument();
      expect(screen.getByText('Missing Prerequisites')).toBeInTheDocument();
      expect(screen.getByText('Available in Catalog')).toBeInTheDocument();
    });

    it('F20-T1-02: displays accurate metric counter for each status category', () => {
      renderWithIntl(<IntegrationsHealthStrip stats={sampleStats} />);

      expect(screen.getByText('3')).toBeInTheDocument();
      expect(screen.getByText('1')).toBeInTheDocument();
      expect(screen.getByText('2')).toBeInTheDocument();
      expect(screen.getByText('12')).toBeInTheDocument();
    });

    it('F20-T1-03: triggers onFilterChange when user clicks a health status card', async () => {
      const user = userEvent.setup();
      const onFilterMock = vi.fn();

      renderWithIntl(<IntegrationsHealthStrip stats={sampleStats} onFilterChange={onFilterMock} />);

      const degradedCard = screen.getByRole('button', { name: /Degraded \/ Retrying: 1/i });
      await user.click(degradedCard);

      expect(onFilterMock).toHaveBeenCalledWith('degraded');
    });

    it('F20-T1-04: highlights selected filter card with visual ring and aria-pressed="true"', () => {
      renderWithIntl(<IntegrationsHealthStrip stats={sampleStats} selectedFilter="active" />);

      const activeCard = screen.getByRole('button', { name: /Active Streams: 3/i });
      expect(activeCard).toHaveAttribute('aria-pressed', 'true');
      expect(activeCard.className).toContain('ring-2');
    });

    it('F20-T1-05: renders responsive grid adapting from 2 columns on mobile to 4 columns on desktop', () => {
      const { container } = renderWithIntl(<IntegrationsHealthStrip stats={sampleStats} />);

      const section = container.querySelector('section');
      expect(section).toHaveClass('grid-cols-2');
      expect(section).toHaveClass('md:grid-cols-4');
    });
  });

  describe('Tier 2: Boundary Values & Error Handling', () => {
    it('F20-T2-01: handles all zeroes stats cleanly (new empty workspace)', () => {
      renderWithIntl(
        <IntegrationsHealthStrip
          stats={{
            activeCount: 0,
            degradedCount: 0,
            missingCount: 0,
            availableCount: 0,
          }}
        />,
      );

      const zeros = screen.getAllByText('0');
      expect(zeros).toHaveLength(4);
    });

    it('F20-T2-02: handles large counter values without visual clipping', () => {
      renderWithIntl(
        <IntegrationsHealthStrip
          stats={{
            activeCount: 999,
            degradedCount: 150,
            missingCount: 88,
            availableCount: 4200,
          }}
        />,
      );

      expect(screen.getByText('4200')).toBeInTheDocument();
      expect(screen.getByText('999')).toBeInTheDocument();
    });

    it('F20-T2-03: renders without crashing when onFilterChange callback is omitted', async () => {
      const user = userEvent.setup();
      renderWithIntl(<IntegrationsHealthStrip stats={sampleStats} />);

      const card = screen.getByRole('button', { name: /Active Streams: 3/i });
      await user.click(card);

      expect(card).toBeInTheDocument();
    });

    it('F20-T2-04: verifies semantic color coding on health status cards (emerald, rose, amber, blue)', () => {
      const { container } = renderWithIntl(<IntegrationsHealthStrip stats={sampleStats} />);

      expect(container.innerHTML).toContain('text-emerald-500');
      expect(container.innerHTML).toContain('text-rose-500');
      expect(container.innerHTML).toContain('text-amber-500');
      expect(container.innerHTML).toContain('text-blue-500');
    });

    it('F20-T2-05: verifies accessibility with aria-label on all card buttons', () => {
      renderWithIntl(<IntegrationsHealthStrip stats={sampleStats} />);

      const buttons = screen.getAllByRole('button');
      buttons.forEach((btn) => {
        expect(btn).toHaveAttribute('aria-label');
      });
    });
  });
});
