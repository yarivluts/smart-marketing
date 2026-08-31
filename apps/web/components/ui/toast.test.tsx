import { describe, expect, it } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { toast } from './use-toast';
import { Toaster } from './toaster';

describe('Toast & Toaster', () => {
  it('displays a triggered toast message with success styling and dismisses it', async () => {
    const user = userEvent.setup();
    render(<Toaster />);

    act(() => {
      toast({
        title: 'Campaign Saved',
        description: 'Changes applied successfully',
        variant: 'success',
      });
    });

    expect(screen.getByText('Campaign Saved')).toBeInTheDocument();
    expect(screen.getByText('Changes applied successfully')).toBeInTheDocument();

    const dismissBtn = screen.getByRole('button', { name: 'Dismiss notification' });
    await user.click(dismissBtn);

    expect(screen.queryByText('Campaign Saved')).not.toBeInTheDocument();
  });
});
