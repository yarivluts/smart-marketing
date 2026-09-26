import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import enMessages from '../../messages/en.json';
import heMessages from '../../messages/he.json';
import type { RecordFeedEntryView } from '@/lib/orgs/record-feed-view';
import { RecordFeedEntryList, RecordFeedFieldSelect } from './record-feed-entry-list';

function entry(overrides: Partial<RecordFeedEntryView> & Pick<RecordFeedEntryView, 'id'>): RecordFeedEntryView {
  return {
    environmentId: 'env-prod',
    clientId: `client-${overrides.id}`,
    landedAt: '2026-09-25T10:00:00.000Z',
    fields: [],
    identity: [],
    ...overrides,
  };
}

function renderList(entries: RecordFeedEntryView[], locale: 'en' | 'he' = 'en') {
  return render(
    <NextIntlClientProvider locale={locale} messages={locale === 'he' ? heMessages : enMessages}>
      <RecordFeedEntryList entries={entries} environmentDisplayNameById={new Map([['env-prod', 'Production']])} />
    </NextIntlClientProvider>,
  );
}

describe('RecordFeedEntryList (KAN-210 identity line)', () => {
  it('renders each record\'s anon_id and customer_id on a labelled Identity line alongside its declared fields and id', () => {
    renderList([
      entry({
        id: 'r1',
        clientId: 'evt-1',
        fields: [{ name: 'plan', value: 'pro', isPii: false }],
        identity: [
          { name: 'anon_id', value: 'anon-3', isPii: false },
          { name: 'customer_id', value: 'cust-9', isPii: false },
        ],
      }),
    ]);

    const identity = screen.getByRole('group', { name: 'Identity' });
    expect(within(identity).getByText('anon_id: anon-3')).toBeInTheDocument();
    expect(within(identity).getByText('customer_id: cust-9')).toBeInTheDocument();
    expect(screen.getByText('plan: pro')).toBeInTheDocument();
    expect(screen.getByText('id evt-1')).toBeInTheDocument();
    expect(screen.getByText('Production')).toBeInTheDocument();
  });

  it('says so explicitly when a record carries no identity keys, since that is itself the stitching answer', () => {
    renderList([entry({ id: 'r1' })]);
    const identity = screen.getByRole('group', { name: 'Identity' });
    expect(within(identity).getByText('no anon_id or customer_id on this record')).toBeInTheDocument();
  });

  it('renders only the redaction placeholder for an identity key flagged PII', () => {
    renderList([entry({ id: 'r1', identity: [{ name: 'customer_id', value: '••••••', isPii: true }] })]);
    const identity = screen.getByRole('group', { name: 'Identity' });
    expect(within(identity).getByText('customer_id: ••••••')).toHaveClass('text-muted-foreground');
  });

  it('keeps identity values left-to-right inside the Hebrew layout', () => {
    renderList([entry({ id: 'r1', identity: [{ name: 'anon_id', value: 'anon-3', isPii: false }] })], 'he');
    const identity = screen.getByRole('group', { name: heMessages.RecordFeed.identityLabel });
    expect(within(identity).getByText('anon_id: anon-3')).toHaveAttribute('dir', 'ltr');
  });
});

describe('RecordFeedFieldSelect', () => {
  it('offers the identity keys as their own group alongside the declared fields', () => {
    render(
      <NextIntlClientProvider locale="en" messages={enMessages}>
        <label htmlFor="f">field</label>
        <RecordFeedFieldSelect id="f" declaredFieldNames={['plan']} identityFieldNames={['anon_id', 'customer_id']} defaultValue="anon_id" />
      </NextIntlClientProvider>,
    );

    const select = screen.getByLabelText('field') as HTMLSelectElement;
    expect(select.value).toBe('anon_id');
    const identityGroup = screen.getByRole('group', { name: 'Identity' });
    expect(within(identityGroup).getAllByRole('option').map((option) => option.textContent)).toEqual(['anon_id', 'customer_id']);
    const declaredGroup = screen.getByRole('group', { name: 'Schema fields' });
    expect(within(declaredGroup).getAllByRole('option').map((option) => option.textContent)).toEqual(['plan']);
  });

  it('omits the identity group entirely when no identity key is filterable', () => {
    render(
      <NextIntlClientProvider locale="en" messages={enMessages}>
        <RecordFeedFieldSelect id="f" declaredFieldNames={['plan']} identityFieldNames={[]} defaultValue="" />
      </NextIntlClientProvider>,
    );
    expect(screen.queryByRole('group', { name: 'Identity' })).not.toBeInTheDocument();
  });
});
