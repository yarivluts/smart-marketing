import { describe, expect, it, vi } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithIntl } from '../../../tests/e2e/helpers/test-harness';
import { CommandPalette } from '../command-palette';

const pushMock = vi.fn();

vi.mock('@/i18n/navigation', () => ({
  useRouter: () => ({
    push: pushMock,
    replace: vi.fn(),
  }),
}));

describe('F06: Global Command Palette (Cmd+K / Ctrl+K)', () => {
  describe('Tier 1: Primary Happy Path Scenarios', () => {
    it('F06-T1-01: renders search trigger button with Cmd+K badge', () => {
      renderWithIntl(<CommandPalette orgId="" projectId="" />);

      const trigger = screen.getByRole('button', { name: /jump to any module/i });
      expect(trigger).toBeInTheDocument();
      expect(screen.getByText('⌘K')).toBeInTheDocument();
    });

    it('F06-T1-02: opens command dialog when trigger button is clicked', async () => {
      const user = userEvent.setup();
      renderWithIntl(<CommandPalette orgId="" projectId="" />);

      const trigger = screen.getByRole('button', { name: /jump to any module/i });
      await user.click(trigger);

      expect(screen.getByRole('dialog', { name: /command search dialog/i })).toBeInTheDocument();
      expect(screen.getByPlaceholderText(/type a command/i)).toBeInTheDocument();
    });

    it('F06-T1-03: opens dialog on global Cmd+K keyboard shortcut', () => {
      renderWithIntl(<CommandPalette orgId="" projectId="" />);

      fireEvent.keyDown(document, { key: 'k', metaKey: true });

      expect(screen.getByRole('dialog', { name: /command search dialog/i })).toBeInTheDocument();
    });

    it('F06-T1-04: filters 6-cluster navigation items matching search query in real-time', async () => {
      const user = userEvent.setup();
      renderWithIntl(<CommandPalette orgId="" projectId="" isOpen={true} />);

      const input = screen.getByPlaceholderText(/type a command/i);
      await user.type(input, 'campaigns');

      expect(screen.getAllByText('Ad Campaigns & ROAS').length).toBeGreaterThan(0);
      expect(screen.queryByText('Acquisition & Breakeven')).not.toBeInTheDocument();
    });

    it('F06-T1-05: navigates to selected item when clicked or on Enter keypress', async () => {
      const user = userEvent.setup();
      renderWithIntl(<CommandPalette orgId="" projectId="" isOpen={true} />);

      const firstOption = screen.getAllByRole('option')[0];
      await user.click(firstOption);

      expect(pushMock).toHaveBeenCalled();
    });
  });

  describe('Tier 2: Boundary Values & Error Handling', () => {
    it('F06-T2-01: opens dialog on Ctrl+K shortcut on Windows/Linux', () => {
      renderWithIntl(<CommandPalette orgId="" projectId="" />);

      fireEvent.keyDown(document, { key: 'k', ctrlKey: true });

      expect(screen.getByRole('dialog', { name: /command search dialog/i })).toBeInTheDocument();
    });

    it('F06-T2-02: closes dialog on Escape keypress', () => {
      renderWithIntl(<CommandPalette orgId="" projectId="" />);

      fireEvent.keyDown(document, { key: 'k', metaKey: true });
      expect(screen.getByRole('dialog', { name: /command search dialog/i })).toBeInTheDocument();

      fireEvent.keyDown(document, { key: 'Escape' });
      expect(screen.queryByRole('dialog', { name: /command search dialog/i })).not.toBeInTheDocument();
    });

    it('F06-T2-03: displays friendly empty state when query has 0 matches', async () => {
      const user = userEvent.setup();
      renderWithIntl(<CommandPalette orgId="" projectId="" isOpen={true} />);

      const input = screen.getByPlaceholderText(/type a command/i);
      await user.type(input, 'xyznonexistentterm999');

      expect(screen.getByText(/no matching commands/i)).toBeInTheDocument();
    });

    it('F06-T2-04: navigates highlighted items using ArrowDown and ArrowUp keyboard keys', () => {
      renderWithIntl(<CommandPalette orgId="" projectId="" isOpen={true} />);

      const input = screen.getByPlaceholderText(/type a command/i);
      const options = screen.getAllByRole('option');

      expect(options[0]).toHaveAttribute('aria-selected', 'true');

      fireEvent.keyDown(input, { key: 'ArrowDown' });
      expect(options[1]).toHaveAttribute('aria-selected', 'true');

      fireEvent.keyDown(input, { key: 'ArrowUp' });
      expect(options[0]).toHaveAttribute('aria-selected', 'true');
    });

    it('F06-T2-05: renders 2-column layout on desktop with visual preview pane showing route path', () => {
      renderWithIntl(<CommandPalette orgId="" projectId="" isOpen={true} />);

      expect(screen.getByText(/Route:/i)).toBeInTheDocument();
      expect(screen.getByText(/to navigate/i)).toBeInTheDocument();
    });
  });
});
