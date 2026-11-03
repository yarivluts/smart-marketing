import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { GrowthPilotHint } from './growth-pilot-hint';
import en from '../../messages/en.json';
import he from '../../messages/he.json';

vi.mock('@/i18n/navigation', () => ({
  Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

describe('GrowthPilotHint', () => {
  it.each([
    ['en', en],
    ['he', he],
  ] as const)('links to the project Growth Pilot in %s', (locale, messages) => {
    render(
      <NextIntlClientProvider locale={locale} messages={messages}>
        <GrowthPilotHint orgId="o1" projectId="p1" />
      </NextIntlClientProvider>,
    );
    expect(screen.getByRole('link').getAttribute('href')).toBe('/orgs/o1/projects/p1/growth-pilot');
  });
});
