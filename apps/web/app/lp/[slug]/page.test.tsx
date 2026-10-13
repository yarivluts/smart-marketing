import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';

const { loadPublicLanding } = vi.hoisted(() => ({ loadPublicLanding: vi.fn() }));
vi.mock('@/lib/growth-pilot/public', () => ({ loadPublicLanding }));
const notFoundError = new Error('NEXT_NOT_FOUND');
vi.mock('next/navigation', () => ({
  notFound: () => {
    throw notFoundError;
  },
}));

import PublicLandingPage, { generateMetadata } from './page';

const CONTENT = { eyebrow: 'For offices', headline: 'Sign fast', subheadline: 'On WhatsApp', benefits: [{ title: 'Fast', text: 'Seconds' }], steps: [], faq: [{ question: 'Price?', answer: 'Free to start' }], ctaText: 'Start now', closingHeadline: 'Ready?' };
const params = (slug: string) => ({ params: Promise.resolve({ slug }) });

describe('public landing page', () => {
  it('shows a published page in its own direction, every button leading to the tagged site, kept out of search', async () => {
    loadPublicLanding.mockResolvedValue({ slug: 'abcDEF123456', content: CONTENT, language: 'he', dir: 'rtl', ctaUrl: 'https://easy-sign.co.il/?utm_campaign=abcDEF123456', host: 'easy-sign.co.il' });
    render(await PublicLandingPage(params('abcDEF123456')));
    expect(screen.getByTestId('growth-landing')).toHaveAttribute('dir', 'rtl');
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Sign fast');
    for (const link of screen.getAllByRole('link', { name: 'Start now' })) expect(link).toHaveAttribute('href', 'https://easy-sign.co.il/?utm_campaign=abcDEF123456');
    expect(screen.getByText('Free to start')).toBeInTheDocument();
    expect(await generateMetadata(params('abcDEF123456'))).toEqual({ title: 'Sign fast', description: 'On WhatsApp', robots: { index: false, follow: false } });
  });

  it('is a plain 404 for anything that is not published', async () => {
    loadPublicLanding.mockResolvedValue(null);
    await expect(PublicLandingPage(params('draft-or-unknown'))).rejects.toBe(notFoundError);
    expect(await generateMetadata(params('x'))).toEqual({ robots: { index: false, follow: false } });
  });
});
