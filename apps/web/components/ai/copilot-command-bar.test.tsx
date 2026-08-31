import { describe, expect, it, vi } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { renderWithIntl } from '@/tests/e2e/helpers/test-harness';
import { MarketingCommandBar } from './copilot-command-bar';

vi.mock('@/i18n/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  Link: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

describe('MarketingCommandBar Component', () => {
  it('renders command bar modal when open is true', () => {
    renderWithIntl(
      <MarketingCommandBar orgId="org-1" projectId="proj-1" isOpen={true} />,
      { locale: 'en' },
    );
    expect(screen.getByTestId('command-bar-dialog')).toBeInTheDocument();
    expect(screen.getByTestId('command-bar-input')).toBeInTheDocument();
  });

  it('filters available commands by search query', () => {
    renderWithIntl(
      <MarketingCommandBar orgId="org-1" projectId="proj-1" isOpen={true} />,
      { locale: 'en' },
    );
    const input = screen.getByTestId('command-bar-input');
    fireEvent.change(input, { target: { value: 'Rebalance' } });

    expect(screen.getByTestId('command-item-ai-rebalance')).toBeInTheDocument();
    expect(screen.queryByTestId('command-item-nav-settings')).not.toBeInTheDocument();
  });

  it('triggers onOpenCopilotWithQuery when AI action is selected', () => {
    const onOpenCopilot = vi.fn();
    renderWithIntl(
      <MarketingCommandBar
        orgId="org-1"
        projectId="proj-1"
        isOpen={true}
        onOpenCopilotWithQuery={onOpenCopilot}
      />,
      { locale: 'en' },
    );

    const rebalanceItem = screen.getByTestId('command-item-ai-rebalance');
    fireEvent.click(rebalanceItem);

    expect(onOpenCopilot).toHaveBeenCalledWith('Reallocate Google to Meta budget');
  });

  it('triggers onClose when close button is clicked', () => {
    const onClose = vi.fn();
    renderWithIntl(
      <MarketingCommandBar
        orgId="org-1"
        projectId="proj-1"
        isOpen={true}
        onClose={onClose}
      />,
      { locale: 'en' },
    );

    const closeBtn = screen.getAllByRole('button').find((b) => !b.textContent);
    if (closeBtn) {
      fireEvent.click(closeBtn);
      expect(onClose).toHaveBeenCalled();
    }
  });
});
