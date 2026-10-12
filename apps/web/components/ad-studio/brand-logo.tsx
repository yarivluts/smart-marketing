'use client';

import * as React from 'react';

/** The project's brand logo URL for ad previews under an open ad; null without one. */
const BrandLogoContext = React.createContext<string | null>(null);

export function BrandLogoProvider({ url, children }: { url: string | null; children: React.ReactNode }): React.ReactElement {
  return <BrandLogoContext.Provider value={url}>{children}</BrandLogoContext.Provider>;
}

export function useBrandLogo(): string | null {
  return React.useContext(BrandLogoContext);
}
