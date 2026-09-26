import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { deriveSetupHealth, SETUP_REQUIREMENT_IDS, type SetupSchemaObservation } from '@growthos/shared';
import { SetupHealthPanel } from './setup-health-panel';
import en from '../../messages/en.json';
import he from '../../messages/he.json';

function observation(overrides: Partial<SetupSchemaObservation> & Pick<SetupSchemaObservation, 'schemaName' | 'kind'>): SetupSchemaObservation {
  return { environmentId: 'env-dev', registered: true, lastAcceptedAt: null, openQuarantinedCount: 0, quarantineReasons: [], ...overrides };
}

/** EasySign dev (KAN-197): touchpoints, signups, documents and customers flowing; billing rejected; no ad spend. */
const DEV_HEALTH = deriveSetupHealth(
  [{ id: 'env-dev', name: 'dev' }],
  [
    observation({ schemaName: 'touchpoint', kind: 'event', lastAcceptedAt: '2026-09-25T16:11:58.000Z' }),
    observation({ schemaName: 'signup', kind: 'event', lastAcceptedAt: '2026-09-25T16:12:04.000Z' }),
    observation({ schemaName: 'document_created', kind: 'event', lastAcceptedAt: '2026-09-25T16:13:10.000Z' }),
    observation({ schemaName: 'customer', kind: 'entity', lastAcceptedAt: '2026-09-25T16:12:05.000Z' }),
    observation({ schemaName: 'subscription_state_change', kind: 'event', registered: false, openQuarantinedCount: 2, quarantineReasons: ['schema_not_registered:subscription_state_change'] }),
    observation({ schemaName: 'ad_spend', kind: 'measure', registered: true }),
  ],
).environments[0];

function renderPanel(locale: 'en' | 'he', environmentLabel: string) {
  return render(
    <NextIntlClientProvider locale={locale} messages={locale === 'en' ? en : he}>
      <SetupHealthPanel health={DEV_HEALTH} environmentLabel={environmentLabel} />
    </NextIntlClientProvider>,
  );
}

describe('SetupHealthPanel (KAN-197)', () => {
  it('shows each requirement with the status its records give it, and why', () => {
    renderPanel('en', 'Development');
    expect(screen.getByText('4 of 6 setup requirements connected in the Development environment.')).toBeInTheDocument();

    const signups = within(screen.getByTestId('setup-requirement-signups'));
    expect(signups.getByText('Connected')).toBeInTheDocument();
    expect(signups.getByText('Accepted records for "signup", latest at 2026-09-25T16:12:04.000Z.')).toBeInTheDocument();

    const billing = within(screen.getByTestId('setup-requirement-billing'));
    expect(billing.getByText('Rejected records only')).toBeInTheDocument();
    expect(billing.getByText(/2 records are rejected and open in quarantine \("subscription_state_change"\)/)).toBeInTheDocument();
    expect(billing.getByText(/subscription_state_change events or the Stripe connector/)).toBeInTheDocument();

    const adSpend = within(screen.getByTestId('setup-requirement-ad_spend'));
    expect(adSpend.getByText('Not connected')).toBeInTheDocument();
    expect(adSpend.getByText('Registered but never received in this environment: "ad_spend".')).toBeInTheDocument();
  });

  it('says the schema-to-requirement match is inferred from names, in both locales', () => {
    renderPanel('en', 'Development');
    expect(screen.getByTestId('setup-health-mapping-note')).toHaveTextContent(en.SetupHealth.mappingNote);
    expect(en.SetupHealth.mappingNote).toContain('order_viewed');
    expect(he.SetupHealth.mappingNote).not.toBe(en.SetupHealth.mappingNote);
  });

  it('never shows the impact line for a connected requirement', () => {
    renderPanel('en', 'Development');
    expect(within(screen.getByTestId('setup-requirement-signups')).queryByText(/funnel has no entry step/)).not.toBeInTheDocument();
  });

  for (const [locale, label] of [
    ['en', en.EnvBadge.dev],
    ['he', he.EnvBadge.dev],
  ] as const) {
    it(`${locale}: every requirement and status renders from translations, never a raw key`, () => {
      const { container } = renderPanel(locale, label);
      expect(container.textContent).not.toMatch(/SetupHealth\./);
      for (const id of SETUP_REQUIREMENT_IDS) {
        expect(screen.getByTestId(`setup-requirement-${id}`)).toBeInTheDocument();
      }
    });
  }

  it('he: renders the Hebrew copy, not the English', () => {
    renderPanel('he', he.EnvBadge.dev);
    expect(screen.getByText(he.SetupHealth.heading)).toBeInTheDocument();
    expect(screen.getAllByText(he.SetupHealth.status.connected).length).toBe(4);
    expect(he.SetupHealth.heading).not.toBe(en.SetupHealth.heading);
  });
});
