import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Switch } from './switch';

describe('Switch', () => {
  it('renders unchecked by default and toggles on click', async () => {
    const user = userEvent.setup();
    const handleCheckedChange = vi.fn();
    render(<Switch aria-label="Auto Optimize" onCheckedChange={handleCheckedChange} />);

    const toggle = screen.getByRole('switch', { name: 'Auto Optimize' });
    expect(toggle).toHaveAttribute('aria-checked', 'false');

    await user.click(toggle);

    expect(toggle).toHaveAttribute('aria-checked', 'true');
    expect(handleCheckedChange).toHaveBeenCalledWith(true);
  });
});
