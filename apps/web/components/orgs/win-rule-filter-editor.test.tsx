import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { emptyWinRuleFilterRow, WinRuleFilterEditor, type WinRuleFilterRow } from './win-rule-filter-editor';
import messages from '../../messages/en.json';

function renderEditor(filters: WinRuleFilterRow[], onChange: (filters: WinRuleFilterRow[]) => void): void {
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <WinRuleFilterEditor filters={filters} onChange={onChange} />
    </NextIntlClientProvider>,
  );
}

describe('WinRuleFilterEditor', () => {
  it('shows the empty-state hint when there are no filters', () => {
    renderEditor([], vi.fn());
    expect(screen.getByText('No filters — any occurrence of this event is a win.')).toBeInTheDocument();
  });

  it('adds a blank filter row', () => {
    const onChange = vi.fn();
    renderEditor([], onChange);

    fireEvent.click(screen.getByRole('button', { name: 'Add filter' }));

    expect(onChange).toHaveBeenCalledWith([emptyWinRuleFilterRow()]);
  });

  it('updates a filter row field/operator/value', () => {
    const onChange = vi.fn();
    renderEditor([emptyWinRuleFilterRow()], onChange);

    fireEvent.change(screen.getByLabelText('Field'), { target: { value: 'properties.amount' } });
    expect(onChange).toHaveBeenLastCalledWith([{ ...emptyWinRuleFilterRow(), field: 'properties.amount' }]);

    fireEvent.change(screen.getByLabelText('Operator'), { target: { value: '=' } });
    expect(onChange).toHaveBeenLastCalledWith([{ ...emptyWinRuleFilterRow(), operator: '=' }]);

    fireEvent.change(screen.getByLabelText('Value'), { target: { value: '100' } });
    expect(onChange).toHaveBeenLastCalledWith([{ ...emptyWinRuleFilterRow(), value: '100' }]);
  });

  it('removes a filter row', () => {
    const onChange = vi.fn();
    renderEditor([emptyWinRuleFilterRow(), { field: 'plan', operator: '=', value: 'enterprise' }], onChange);

    fireEvent.click(screen.getAllByRole('button', { name: 'Remove' })[0]);

    expect(onChange).toHaveBeenCalledWith([{ field: 'plan', operator: '=', value: 'enterprise' }]);
  });
});
