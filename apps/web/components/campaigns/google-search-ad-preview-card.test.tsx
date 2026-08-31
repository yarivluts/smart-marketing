import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithIntl } from '../../tests/e2e/helpers/test-harness';
import { GoogleSearchAdPreviewCard } from './google-search-ad-preview-card';

describe('GoogleSearchAdPreviewCard', () => {
  it('renders Google RSA search ad with breadcrumbs, multi-headlines, descriptions, and keyword chips', () => {
    renderWithIntl(
      <GoogleSearchAdPreviewCard
        campaignName="Google Search - Commercial"
        headlines={['Electronic Signature Tool', 'Sign PDF Online Fast', 'Free 14-Day Trial']}
        descriptions={[
          'Close deals faster with automated signing workflows.',
          'Trusted by 5,000+ businesses worldwide.',
        ]}
        finalUrl="https://growthos.io/signup"
        keywords={['electronic signature', 'online signing', 'contract automation']}
      />,
    );

    expect(screen.getByTestId('google-search-ad-preview-card')).toBeInTheDocument();
    expect(screen.getByText('Sponsored')).toBeInTheDocument();
    expect(screen.getByText(/growthos\.io/)).toBeInTheDocument();
    expect(screen.getByText('Electronic Signature Tool')).toBeInTheDocument();
    expect(screen.getByText('Sign PDF Online Fast')).toBeInTheDocument();
    expect(screen.getByText('Free 14-Day Trial')).toBeInTheDocument();
    expect(screen.getByText('Close deals faster with automated signing workflows.')).toBeInTheDocument();
    expect(screen.getByText('Trusted by 5,000+ businesses worldwide.')).toBeInTheDocument();
    expect(screen.getByText('electronic signature')).toBeInTheDocument();
    expect(screen.getByText('online signing')).toBeInTheDocument();
    expect(screen.getByText('contract automation')).toBeInTheDocument();
  });

  it('renders in Hebrew RTL with correct translation', () => {
    renderWithIntl(
      <GoogleSearchAdPreviewCard
        campaignName="חיפוש מסחרי"
        headlines={['כלי חתימה אלקטרונית', 'חתום מהר על PDF']}
        descriptions={['סגור עסקאות מהר יותר עם תהליכים אוטומטיים.']}
        finalUrl="https://growthos.io/he/signup"
      />,
      { locale: 'he' },
    );

    expect(screen.getByTestId('google-search-ad-preview-card')).toBeInTheDocument();
    expect(screen.getByText('ממומן')).toBeInTheDocument();
    expect(screen.getByText('כלי חתימה אלקטרונית')).toBeInTheDocument();
  });
});
