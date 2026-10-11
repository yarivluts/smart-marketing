import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithIntl } from '../../tests/e2e/helpers/test-harness';
import { MetaAdPreviewCard } from './meta-ad-preview-card';
import type { ImportedAdView } from './campaign-creatives-panel';

const mockAd: ImportedAdView = {
  adName: 'DocSign Growth Ad #1',
  adSetName: 'Legal Audience',
  headline: 'Sign Documents 10x Faster',
  primaryText: 'Automate contracts and signatures in seconds with GrowthOS.',
  description: 'Secure, legally compliant electronic signatures.',
  imageUrl: 'https://example.com/ad-image.jpg',
  linkUrl: 'https://growthos.io/easysign',
  callToActionType: 'SIGN_UP',
  status: 'ACTIVE',
};

describe('MetaAdPreviewCard', () => {
  it('renders Meta feed ad preview with sponsor header, copy, image, and CTA', () => {
    renderWithIntl(<MetaAdPreviewCard campaignName="Meta Retargeting" ad={mockAd} />);

    expect(screen.getByTestId('meta-ad-preview-card')).toBeInTheDocument();
    expect(screen.getByText('Meta Retargeting')).toBeInTheDocument();
    expect(screen.getByText('Sponsored')).toBeInTheDocument();
    expect(screen.getByText('ACTIVE')).toBeInTheDocument();
    expect(screen.getByText('Automate contracts and signatures in seconds with GrowthOS.')).toBeInTheDocument();
    expect(screen.getByRole('img')).toHaveAttribute('src', 'https://example.com/ad-image.jpg');
    expect(screen.getByText('Sign Documents 10x Faster')).toBeInTheDocument();
    expect(screen.getByText('Secure, legally compliant electronic signatures.')).toBeInTheDocument();
    expect(screen.getByText('growthos.io')).toBeInTheDocument();
    expect(screen.getByText('Sign Up')).toBeInTheDocument();
  });

  it('renders placeholder image when imageUrl is not provided', () => {
    const adWithoutImage = { ...mockAd, imageUrl: '' };
    renderWithIntl(<MetaAdPreviewCard campaignName="Meta Retargeting" ad={adWithoutImage} />);

    expect(screen.getByText('Creative Preview Mockup')).toBeInTheDocument();
  });

  /**
   * The card used to fall back to the literal string 'growthos.io' when an ad had no link.
   * This preview is a facsimile of the real Facebook ad unit, so that stand-in read as the
   * ad's actual destination rather than as an absence.
   */
  it('shows no destination domain at all when the ad carries no link', () => {
    const adWithoutLink = { ...mockAd, linkUrl: undefined };
    renderWithIntl(<MetaAdPreviewCard campaignName="Meta Retargeting" ad={adWithoutLink} />);

    expect(screen.queryByText('growthos.io')).not.toBeInTheDocument();
    // The rest of the ad still renders — only the domain line is withheld.
    expect(screen.getByText('Sign Documents 10x Faster')).toBeInTheDocument();
  });

  it('renders in Hebrew RTL with correct translation', () => {
    renderWithIntl(<MetaAdPreviewCard campaignName="Meta Retargeting" ad={mockAd} />, {
      locale: 'he',
    });

    expect(screen.getByTestId('meta-ad-preview-card')).toBeInTheDocument();
    expect(screen.getByText('ממומן')).toBeInTheDocument();
    expect(screen.getByText('הרשמה')).toBeInTheDocument();
  });
});
