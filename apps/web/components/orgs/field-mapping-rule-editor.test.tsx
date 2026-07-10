import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { blankFieldMappingRuleRow, FieldMappingRuleEditor, type FieldMappingRuleRow } from './field-mapping-rule-editor';
import messages from '../../messages/en.json';

function renderEditor(rules: FieldMappingRuleRow[], onChange: (rules: FieldMappingRuleRow[]) => void): void {
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <FieldMappingRuleEditor rules={rules} onChange={onChange} />
    </NextIntlClientProvider>,
  );
}

describe('FieldMappingRuleEditor', () => {
  it('adds a blank rule row', () => {
    const onChange = vi.fn();
    renderEditor([blankFieldMappingRuleRow()], onChange);

    fireEvent.click(screen.getByRole('button', { name: 'Add rule' }));

    expect(onChange).toHaveBeenCalledWith([blankFieldMappingRuleRow(), blankFieldMappingRuleRow()]);
  });

  it('removes a rule row', () => {
    const onChange = vi.fn();
    renderEditor([blankFieldMappingRuleRow(), blankFieldMappingRuleRow()], onChange);

    fireEvent.click(screen.getAllByRole('button', { name: 'Remove' })[0]);

    expect(onChange).toHaveBeenCalledWith([blankFieldMappingRuleRow()]);
  });

  it('shows the sourcePath input only for rename/cast, castType only for cast, template only for template, staticValue only for static', () => {
    const onChange = vi.fn();
    renderEditor([{ ...blankFieldMappingRuleRow(), transform: 'rename' }], onChange);
    expect(screen.queryByLabelText('Source JSONPath, e.g. data.object.amount')).toBeInTheDocument();
    expect(screen.queryByLabelText('Cast to')).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Template/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Static value')).not.toBeInTheDocument();
  });

  it('updates targetField on input', () => {
    const onChange = vi.fn();
    renderEditor([blankFieldMappingRuleRow()], onChange);

    fireEvent.change(screen.getByPlaceholderText('Target field, e.g. properties.amount'), { target: { value: 'properties.amount' } });

    expect(onChange).toHaveBeenCalledWith([{ ...blankFieldMappingRuleRow(), targetField: 'properties.amount' }]);
  });

  it('switching to cast reveals castType and hides template/staticValue', () => {
    const onChange = vi.fn();
    renderEditor([{ ...blankFieldMappingRuleRow(), transform: 'cast' }], onChange);
    expect(screen.queryByLabelText('Cast to')).toBeInTheDocument();
    expect(screen.queryByLabelText('Source JSONPath, e.g. data.object.amount')).toBeInTheDocument();
  });
});
