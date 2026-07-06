import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { SchemaFamilyCard } from './schema-family-card';
import messages from '../../messages/en.json';

vi.mock('@/i18n/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

const VERSIONS = [
  {
    id: 'v1',
    version: 1,
    status: 'superseded' as const,
    fields: [{ name: 'order_id', type: 'string' as const, isRequired: true, isPii: false, isIdentityKey: false }],
  },
  {
    id: 'v2',
    version: 2,
    status: 'active' as const,
    fields: [
      { name: 'order_id', type: 'string' as const, isRequired: true, isPii: false, isIdentityKey: false },
      { name: 'currency', type: 'string' as const, isRequired: false, isPii: false, isIdentityKey: false },
    ],
  },
];

function renderCard(): void {
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <SchemaFamilyCard orgId="org-1" projectId="project-1" kind="event" name="order_completed" versions={VERSIONS} />
    </NextIntlClientProvider>,
  );
}

describe('SchemaFamilyCard', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  it('renders every version — both v1 and v2 stay visible (KAN-31 AC: "both queryable")', () => {
    renderCard();
    expect(screen.getByText('v1 — Superseded')).toBeInTheDocument();
    expect(screen.getByText('v2 — Active')).toBeInTheDocument();
    expect(screen.getAllByText('order_id')).toHaveLength(2);
    expect(screen.getByText('currency')).toBeInTheDocument();
  });

  it('opens an evolve form prefilled from the latest version when Evolve is clicked', () => {
    renderCard();
    fireEvent.click(screen.getByRole('button', { name: 'Evolve' }));

    expect(screen.getByRole('heading', { name: 'Evolve event "order_completed" to a new version' })).toBeInTheDocument();
    const nameInputs = screen.getAllByLabelText('Field name');
    expect(nameInputs).toHaveLength(2);
    expect((nameInputs[0] as HTMLInputElement).value).toBe('order_id');
    expect((nameInputs[1] as HTMLInputElement).value).toBe('currency');
  });
});
