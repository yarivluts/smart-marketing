import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { PlusCircle } from 'lucide-react';
import { Timeline } from './timeline';
import { InitialsAvatar } from './initials-avatar';

describe('Timeline', () => {
  it('renders each group with its label and items in order, with times and meta lines', () => {
    render(
      <Timeline
        label="Activity"
        groups={[
          {
            key: 'd1',
            label: 'Monday',
            sublabel: '2 changes',
            items: [
              { key: 'a', icon: PlusCircle, tone: 'success', title: 'Created board', meta: 'by Ada', time: '10:00' },
              { key: 'b', title: 'Updated goal', time: '09:00' },
            ],
          },
          { key: 'd2', label: 'Sunday', items: [{ key: 'c', title: 'Removed key' }] },
        ]}
      />,
    );
    const region = screen.getByRole('region', { name: 'Activity' });
    const monday = within(region).getByRole('region', { name: 'Monday' });
    expect(within(monday).getByText('2 changes')).toBeInTheDocument();
    expect(within(monday).getAllByRole('listitem').map((item) => item.textContent)).toEqual(['Created board10:00by Ada', 'Updated goal09:00']);
    expect(within(region).getByRole('region', { name: 'Sunday' })).toHaveTextContent('Removed key');
  });
});

describe('InitialsAvatar', () => {
  it('shows the initials, is decorative, and colours the same seed the same way', () => {
    const { container } = render(
      <>
        <InitialsAvatar name="Ada Lovelace" seed="u1" />
        <InitialsAvatar name="Someone Else" seed="u1" />
      </>,
    );
    const avatars = container.querySelectorAll('[data-testid="initials-avatar"]');
    expect(avatars[0]).toHaveTextContent('AL');
    expect(avatars[0]).toHaveAttribute('aria-hidden', 'true');
    expect((avatars[0] as HTMLElement).style.color).toBe((avatars[1] as HTMLElement).style.color);
  });
});
