import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { ThemeDigestGrid } from './theme-digest-grid';

describe('ThemeDigestGrid', () => {
  it('shows each theme with its count and de-duplicated example comments, scaled against the loudest theme', () => {
    const { container } = render(
      <ThemeDigestGrid
        items={[
          { key: 'pricing', label: 'Pricing', count: 4, countLabel: '4 comments', quotes: ['"Too pricey"', '"Too pricey"', '"Costs too much"', '"Third"'] },
          { key: 'bugs', label: 'Bugs', count: 2, countLabel: '2 comments', quotes: [] },
        ]}
      />,
    );
    const cards = within(screen.getByTestId('theme-digest-grid')).getAllByRole('listitem').filter((item) => item.parentElement === screen.getByTestId('theme-digest-grid'));
    expect(cards).toHaveLength(2);
    expect(within(cards[0]).getByText('Pricing')).toBeInTheDocument();
    expect(within(cards[0]).getByText('4 comments')).toBeInTheDocument();
    expect(within(cards[0]).getAllByText('"Too pricey"')).toHaveLength(1);
    expect(within(cards[0]).getByText('"Costs too much"')).toBeInTheDocument();
    expect(within(cards[0]).queryByText('"Third"')).not.toBeInTheDocument();
    const bars = container.querySelectorAll<HTMLDivElement>('.bg-warning.h-full, .h-full.bg-warning');
    expect(bars[0].style.width).toBe('100%');
    expect(bars[1].style.width).toBe('50%');
  });
});
