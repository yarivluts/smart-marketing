'use client';

import * as React from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { X } from 'lucide-react';

/** Countries offered first; any other ISO code can still be typed in the "other" box. */
export const COMMON_AD_COUNTRIES = ['IL', 'US', 'GB', 'CA', 'AU', 'DE', 'FR', 'NL', 'ES', 'IT', 'IE', 'AE', 'IN', 'BR', 'MX', 'ZA', 'SE', 'CH', 'AT', 'BE'] as const;

const ISO = /^[A-Z]{2}$/;

/** The countries an ad targets, as chips with their names in the viewer's language. */
export function CountryPicker({ value, onChange, label }: { value: string[]; onChange: (next: string[]) => void; label: string }): React.ReactElement {
  const t = useTranslations('AdStudio.publish');
  const locale = useLocale();
  const names = React.useMemo(() => {
    try {
      return new Intl.DisplayNames([locale], { type: 'region' });
    } catch {
      return null;
    }
  }, [locale]);
  const name = (code: string) => names?.of(code) ?? code;
  const add = (code: string) => {
    const upper = code.trim().toUpperCase();
    if (ISO.test(upper) && !value.includes(upper)) onChange([...value, upper]);
  };
  const [other, setOther] = React.useState('');

  return (
    <div className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
      <span id="ad-studio-countries-label">{label}</span>
      <ul className="flex flex-wrap gap-1.5" aria-labelledby="ad-studio-countries-label" data-testid="ad-studio-countries">
        {value.map((code) => (
          <li key={code} className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/40 px-2 py-0.5 text-xs text-foreground">
            {name(code)}
            <button type="button" onClick={() => onChange(value.filter((entry) => entry !== code))} aria-label={t('removeCountry', { country: name(code) })}>
              <X className="h-3 w-3" aria-hidden="true" />
            </button>
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap gap-2">
        <select
          value=""
          onChange={(event) => add(event.target.value)}
          aria-label={t('addCountry')}
          className="h-9 min-w-0 flex-1 rounded-lg border border-input bg-background px-2 text-sm text-foreground"
        >
          <option value="">{t('addCountry')}</option>
          {COMMON_AD_COUNTRIES.filter((code) => !value.includes(code)).map((code) => (
            <option key={code} value={code}>
              {name(code)}
            </option>
          ))}
        </select>
        <input
          value={other}
          onChange={(event) => setOther(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              add(other);
              setOther('');
            }
          }}
          maxLength={2}
          dir="ltr"
          placeholder={t('otherCountry')}
          aria-label={t('otherCountry')}
          className="h-9 w-24 rounded-lg border border-input bg-background px-2 text-sm uppercase text-foreground"
        />
      </div>
    </div>
  );
}
