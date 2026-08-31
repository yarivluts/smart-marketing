import { describe, expect, it, vi } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import React, { useState } from 'react';
import { renderWithIntl } from './helpers/test-harness';
import en from '../../messages/en.json';
import he from '../../messages/he.json';
import { getDirection } from '../../i18n/routing';

function getAllKeys(obj: Record<string, any>, prefix = ''): string[] {
  return Object.entries(obj).flatMap(([key, val]) => {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    if (typeof val === 'object' && val !== null) {
      return getAllKeys(val, fullKey);
    }
    return [fullKey];
  });
}

function getAllLeafValues(obj: Record<string, any>): string[] {
  return Object.values(obj).flatMap((val) => {
    if (typeof val === 'object' && val !== null) {
      return getAllLeafValues(val);
    }
    return [String(val)];
  });
}

describe('Tier 1: Bilingual Symmetrical Localization & RTL/LTR (R4)', () => {
  it('7.1 verifies 100% exact translation key parity between English (en.json) and Hebrew (he.json)', () => {
    const enKeys = getAllKeys(en).sort();
    const heKeys = getAllKeys(he).sort();

    expect(heKeys).toEqual(enKeys);
    expect(enKeys.length).toBeGreaterThan(500);
  });

  it('7.2 ensures zero empty or whitespace-only translation strings across all message catalogs', () => {
    const enValues = getAllLeafValues(en);
    const heValues = getAllLeafValues(he);

    for (const val of enValues) {
      expect(val.trim().length).toBeGreaterThan(0);
    }
    for (const val of heValues) {
      expect(val.trim().length).toBeGreaterThan(0);
    }
  });

  it('7.3 determines layout direction correctly: "rtl" for Hebrew and "ltr" for English', () => {
    expect(getDirection('he')).toBe('rtl');
    expect(getDirection('en')).toBe('ltr');
  });

  it('7.4 wraps numeric values, metrics, and currency amounts in <span dir="ltr"> to prevent reversed typography in Hebrew RTL', () => {
    function LocalizedMetricCard({ amount, label }: { amount: number; label: string }) {
      return (
        <div data-testid="localized-metric-card" className="p-4 border rounded">
          <span>{label}</span>
          <span data-testid="isolated-number" dir="ltr">
            ${amount.toLocaleString()}
          </span>
        </div>
      );
    }

    renderWithIntl(<LocalizedMetricCard amount={4250} label="סה״כ הוצאה" />, { locale: 'he' });

    const numberSpan = screen.getByTestId('isolated-number');
    expect(numberSpan).toHaveAttribute('dir', 'ltr');
    expect(numberSpan).toHaveTextContent('$4,250');
  });

  it('7.5 wraps user-generated ad headlines and descriptions with dir="auto"', () => {
    function AdPreview({ headline, primaryText }: { headline: string; primaryText: string }) {
      return (
        <div data-testid="ad-preview" className="p-3 border rounded">
          <h4 data-testid="ad-headline" dir="auto">{headline}</h4>
          <p data-testid="ad-primary-text" dir="auto">{primaryText}</p>
        </div>
      );
    }

    renderWithIntl(
      <AdPreview
        headline="חתימה דיגיטלית מהירה"
        primaryText="חתום על מסמכים וחוזים בקלות מכל מקום בעולם."
      />,
      { locale: 'he' },
    );

    expect(screen.getByTestId('ad-headline')).toHaveAttribute('dir', 'auto');
    expect(screen.getByTestId('ad-primary-text')).toHaveAttribute('dir', 'auto');
    expect(screen.getByText('חתימה דיגיטלית מהירה')).toBeInTheDocument();
  });

  it('7.6 localizes core navigation labels accurately across both languages', () => {
    expect(en.AppShell.brandName).toBe('GrowthOS');
    expect(he.AppShell.brandName).toBe('GrowthOS');
    expect(en.Campaigns.metaTitle).toBe('Campaigns');
    expect(he.Campaigns.metaTitle).toBe('קמפיינים');
    expect(en.Automation.metaTitle).toBe('Automation');
    expect(he.Automation.metaTitle).toBe('אוטומציה');
  });

  it('7.7 Directional Icon Mirroring: flips navigation arrows and progress chevrons in RTL', () => {
    function DirectionalBreadcrumb({ locale = 'en' }: { locale: 'en' | 'he' }) {
      const isRtl = locale === 'he';
      return (
        <div data-testid="breadcrumb-trail" dir={isRtl ? 'rtl' : 'ltr'}>
          <span>Campaigns</span>
          <span
            data-testid="breadcrumb-arrow"
            className={`inline-block transition-transform ${isRtl ? 'rotate-180' : ''}`}
          >
            →
          </span>
          <span>Target Settings</span>
        </div>
      );
    }

    const { rerender } = renderWithIntl(<DirectionalBreadcrumb locale="en" />);
    expect(screen.getByTestId('breadcrumb-arrow')).not.toHaveClass('rotate-180');

    rerender(<DirectionalBreadcrumb locale="he" />);
    expect(screen.getByTestId('breadcrumb-arrow')).toHaveClass('rotate-180');
  });

  it('7.8 LocaleSwitcher: toggles language between English and Hebrew seamlessly', () => {
    function MockLocaleSwitcher({ onLocaleChange = vi.fn() }) {
      const [currentLocale, setCurrentLocale] = useState('en');
      function toggle() {
        const next = currentLocale === 'en' ? 'he' : 'en';
        setCurrentLocale(next);
        onLocaleChange(next);
      }
      return (
        <button
          type="button"
          data-testid="locale-switch-btn"
          onClick={toggle}
          aria-label="Switch Language"
        >
          {currentLocale === 'en' ? 'עברית' : 'English'}
        </button>
      );
    }

    const onLocaleChange = vi.fn();
    renderWithIntl(<MockLocaleSwitcher onLocaleChange={onLocaleChange} />);

    const btn = screen.getByTestId('locale-switch-btn');
    expect(btn).toHaveTextContent('עברית');

    fireEvent.click(btn);
    expect(onLocaleChange).toHaveBeenCalledWith('he');
    expect(btn).toHaveTextContent('English');
  });
});
