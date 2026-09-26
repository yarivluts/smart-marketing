import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import React from 'react';
import { renderWithIntl } from '@/tests/e2e/helpers/test-harness';
import { BarList, ChartCard, DonutChart, EmptyState, FlowDiagram, formatVizValue, Heatmap, layoutFlow, PageHero, Sparkline, TrendChart } from './index';

vi.mock('@/i18n/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  Link: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

describe('PageHero and ChartCard', () => {
  it('renders the title as the page heading, its description, actions and body', () => {
    render(
      <PageHero title="Ingest health" description="What arrived" eyebrow="Data" actions={<button type="button">Run</button>}>
        <p>kpis</p>
      </PageHero>,
    );
    expect(screen.getByRole('heading', { level: 1, name: 'Ingest health' })).toBeInTheDocument();
    expect(screen.getByText('What arrived')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Run' })).toBeInTheDocument();
    expect(screen.getByText('kpis')).toBeInTheDocument();
  });

  it('ChartCard is a named region with its footer', () => {
    render(
      <ChartCard title="Volume" footer="Last 7 days">
        <span>chart</span>
      </ChartCard>,
    );
    expect(screen.getByRole('region', { name: 'Volume' })).toHaveTextContent('chart');
    expect(screen.getByText('Last 7 days')).toBeInTheDocument();
  });
});

describe('EmptyState', () => {
  it('says what is missing and offers the step that fills it', () => {
    render(<EmptyState title="No cohorts yet" description="Send signups to start" action={<a href="/x">Connect</a>} />);
    expect(screen.getByText('No cohorts yet')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Connect' })).toHaveAttribute('href', '/x');
  });
});

describe('Sparkline', () => {
  it('breaks the line at a gap instead of drawing zero', () => {
    const { container } = render(<Sparkline values={[1, 2, null, 3, 4]} label="trend" />);
    expect(container.querySelectorAll('polyline')).toHaveLength(2);
    expect(screen.getByRole('img', { name: 'trend' })).toBeInTheDocument();
  });

  it('draws nothing from fewer than two points', () => {
    const { container } = render(<Sparkline values={[5]} />);
    expect(container.querySelector('svg')).toBeNull();
  });
});

describe('BarList', () => {
  it('ranks by value, scales bars to the largest, and summarises the rest', () => {
    render(
      <BarList
        items={[
          { key: 'a', label: 'Alpha', value: 5 },
          { key: 'b', label: 'Beta', value: 20, href: '/beta' },
          { key: 'c', label: 'Gamma', value: 1 },
        ]}
        maxItems={2}
        moreLabel={(hidden) => `+${hidden} more`}
      />,
    );
    const items = within(screen.getByTestId('bar-list')).getAllByRole('listitem');
    expect(items.map((item) => item.textContent)).toEqual(['Beta20', 'Alpha5']);
    expect(screen.getByRole('link', { name: /Beta/ })).toHaveAttribute('href', '/beta');
    expect(screen.getByText('+1 more')).toBeInTheDocument();
  });
});

describe('Heatmap', () => {
  it('colours each cell by its share of the scale and hatches missing ones', () => {
    render(
      <Heatmap
        label="Retention"
        rowHeader="Cohort"
        columns={['M0', 'M1']}
        max={1}
        valueFormatter={(value) => `${Math.round(value * 100)}%`}
        rows={[
          { key: 'sep', label: 'Sep', sublabel: '64 people', cells: [1, 0.25] },
          { key: 'oct', label: 'Oct', cells: [1, null] },
        ]}
      />,
    );
    const table = screen.getByRole('table', { name: 'Retention' });
    expect(within(table).getByText('25%')).toHaveStyle({ backgroundColor: 'hsl(var(--primary) / 0.285)' });
    expect(within(table).getAllByText('100%')).toHaveLength(2);
    expect(within(table).getByText('64 people')).toBeInTheDocument();
    const octRow = within(table).getByRole('row', { name: /Oct/ });
    expect(within(octRow).getAllByRole('cell')[1]).toBeEmptyDOMElement();
  });
});

describe('TrendChart and DonutChart', () => {
  it('TrendChart exposes every point in its accessible table', () => {
    renderWithIntl(
      <TrendChart
        label="Signups per day"
        xKey="day"
        series={[{ key: 'signups', label: 'Signups' }]}
        data={[
          { day: '2026-09-24', signups: 2 },
          { day: '2026-09-25', signups: null },
        ]}
      />,
      { locale: 'en' },
    );
    const table = within(screen.getByTestId('trend-chart')).getByRole('table');
    expect(within(table).getByRole('row', { name: '2026-09-24 2' })).toBeInTheDocument();
    expect(within(table).getByRole('row', { name: '2026-09-25 -' })).toBeInTheDocument();
  });

  it('DonutChart lists each slice with its share', () => {
    renderWithIntl(
      <DonutChart
        label="By channel"
        centerValue="10"
        data={[
          { label: 'Google', value: 3 },
          { label: 'Meta', value: 7 },
        ]}
      />,
      { locale: 'en' },
    );
    expect(screen.getByText('Meta').closest('li')).toHaveTextContent('7 · 70%');
    expect(screen.getByText('10')).toBeInTheDocument();
  });
});

describe('formatVizValue', () => {
  it('formats each descriptor in the given locale', () => {
    expect(formatVizValue(1234.5, 'number', 'en')).toBe('1,234.5');
    expect(formatVizValue(0.425, 'ratio', 'en')).toBe('42.5%');
    expect(formatVizValue(42, 'percent', 'en')).toBe('42%');
    expect(formatVizValue(1500, 'compact', 'en')).toBe('1.5K');
    expect(formatVizValue(20, { currency: 'ILS' }, 'en')).toBe('₪20');
    expect(formatVizValue(Number.NaN)).toBe('-');
  });
});

describe('FlowDiagram', () => {
  it('lays nodes out in columns by their longest path from a source', () => {
    const positions = layoutFlow(
      [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }, { id: 'c', label: 'C' }, { id: 'd', label: 'D' }],
      [
        { source: 'a', target: 'b' },
        { source: 'b', target: 'd' },
        { source: 'a', target: 'c' },
        { source: 'c', target: 'd' },
      ],
    );
    expect(positions.get('a')?.column).toBe(0);
    expect(positions.get('b')?.column).toBe(1);
    expect(positions.get('c')?.column).toBe(1);
    expect(positions.get('d')?.column).toBe(2);
  });

  it('survives a cycle instead of recursing forever', () => {
    const positions = layoutFlow([{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }], [{ source: 'a', target: 'b' }, { source: 'b', target: 'a' }]);
    expect(positions.size).toBe(2);
  });

  it('describes every edge for screen readers', () => {
    renderWithIntl(
      <FlowDiagram
        label="Pipeline"
        nodes={[
          { id: 'ingest', label: 'Ingest', value: '82', status: 'ok' },
          { id: 'warehouse', label: 'Warehouse', status: 'warn' },
        ]}
        edges={[{ source: 'ingest', target: 'warehouse', label: 'hourly', animated: true }]}
      />,
      { locale: 'en' },
    );
    expect(within(screen.getByTestId('flow-diagram')).getByText('Ingest → Warehouse: hourly')).toBeInTheDocument();
  });
});
