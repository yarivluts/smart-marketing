import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { WinRuleList } from './win-rule-list';
import type { WinRuleSummaryView } from '@/lib/orgs/win-rule-view';
import messages from '../../messages/en.json';

const refresh = vi.fn();

vi.mock('@/i18n/navigation', () => ({
  useRouter: () => ({ refresh }),
}));

function renderList(winRules: WinRuleSummaryView[]): void {
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <WinRuleList orgId="org-1" projectId="project-1" winRules={winRules} />
    </NextIntlClientProvider>,
  );
}

const activeRule: WinRuleSummaryView = {
  id: 'rule-1',
  name: 'Big order',
  schemaName: 'order_completed',
  filters: [{ field: 'properties.amount', operator: '>', value: '100' }],
  active: true,
  createdAt: '2026-07-11T00:00:00.000Z',
};

describe('WinRuleList', () => {
  beforeEach(() => {
    refresh.mockClear();
    vi.stubGlobal('fetch', vi.fn());
  });

  it('shows an empty state when there are no rules', () => {
    renderList([]);
    expect(screen.getByText('This project has no win rules yet.')).toBeInTheDocument();
  });

  it('renders a rule with its schema and filter summary', () => {
    renderList([activeRule]);
    expect(screen.getByText('Big order')).toBeInTheDocument();
    expect(screen.getByText('On order_completed — properties.amount > 100')).toBeInTheDocument();
    expect(screen.getByText('Active')).toBeInTheDocument();
  });

  it('shows "any occurrence" for a filterless rule', () => {
    renderList([{ ...activeRule, filters: [] }]);
    expect(screen.getByText('On order_completed — any occurrence')).toBeInTheDocument();
  });

  it('joins multiple filters with the translated joiner, not a hard-coded literal', () => {
    renderList([
      {
        ...activeRule,
        filters: [
          { field: 'properties.amount', operator: '>', value: '100' },
          { field: 'plan', operator: '=', value: 'enterprise' },
        ],
      },
    ]);
    expect(screen.getByText('On order_completed — properties.amount > 100 AND plan = enterprise')).toBeInTheDocument();
  });

  it('disables a rule and refreshes', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: true } as Response);
    renderList([activeRule]);

    fireEvent.click(screen.getByRole('button', { name: 'Disable' }));

    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(fetch).toHaveBeenCalledWith(
      '/api/orgs/org-1/projects/project-1/win-rules/rule-1',
      expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ active: false }) }),
    );
  });

  it('deletes a rule and refreshes', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: true } as Response);
    renderList([activeRule]);

    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));

    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(fetch).toHaveBeenCalledWith('/api/orgs/org-1/projects/project-1/win-rules/rule-1', { method: 'DELETE' });
  });

  it('shows an inline error when an action fails', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: false } as Response);
    renderList([activeRule]);

    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Could not update this win rule. Please try again.');
    expect(refresh).not.toHaveBeenCalled();
  });
});
