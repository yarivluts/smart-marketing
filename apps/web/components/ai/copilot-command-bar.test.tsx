import { describe, expect, it, vi } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { renderWithIntl } from '@/tests/e2e/helpers/test-harness';
import { MarketingCommandBar } from './copilot-command-bar';

const routerPush = vi.fn();

vi.mock('@/i18n/navigation', () => ({
  useRouter: () => ({ push: routerPush, refresh: vi.fn() }),
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
    fireEvent.change(input, { target: { value: 'funnel step' } });

    expect(screen.getByTestId('command-item-ai-ask-funnel')).toBeInTheDocument();
    expect(screen.queryByTestId('command-item-nav-settings')).not.toBeInTheDocument();
  });

  it('triggers onOpenCopilotWithQuery with a question when an Ask AI item is selected', () => {
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

    fireEvent.click(screen.getByTestId('command-item-ai-ask-funnel'));

    expect(onOpenCopilot).toHaveBeenCalledWith(
      "Using this project's funnel data, which step loses the most people, and what is known about the people who drop off there?",
    );
  });

  // KAN-212: the bar knows nothing about the project's data, so it must never present a budget,
  // an amount or a channel move as advice.
  it.each(['en', 'he'] as const)('never offers an invented recommendation (%s)', (locale) => {
    const onOpenCopilot = vi.fn();
    renderWithIntl(
      <MarketingCommandBar orgId="org-1" projectId="proj-1" isOpen={true} onOpenCopilotWithQuery={onOpenCopilot} />,
      { locale },
    );
    const aiItems = ['ai-ask-spend', 'ai-ask-funnel', 'ai-ask-goals'].map((id) => screen.getByTestId(`command-item-${id}`));
    for (const item of aiItems) {
      fireEvent.click(item);
    }
    const labels = aiItems.map((item) => item.querySelector('div > span')?.textContent ?? '');
    const shown = [...labels, ...onOpenCopilot.mock.calls.map(([query]) => String(query))];
    expect(onOpenCopilot).toHaveBeenCalledTimes(3);
    expect(shown).toHaveLength(6);
    for (const text of shown) {
      expect(text).not.toMatch(/[$₪€]|\d/);
      // Channel names in English and as the Hebrew translation spells them (escaped: no Hebrew in code files).
      expect(text).not.toMatch(/meta|google|\u05DE\u05D8\u05D0|\u05D2\u05D5\u05D2\u05DC/i);
      expect(text).toMatch(/\?$/);
    }
  });

  it('opens the page that holds the answer when there is no Copilot', () => {
    renderWithIntl(<MarketingCommandBar orgId="org-1" projectId="proj-1" isOpen={true} />, { locale: 'en' });
    fireEvent.click(screen.getByTestId('command-item-ai-ask-goals'));
    expect(routerPush).toHaveBeenCalledWith('/orgs/org-1/projects/proj-1/goals');
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
