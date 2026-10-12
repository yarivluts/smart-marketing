'use client';

import * as React from 'react';

/**
 * What the ad's claims may rest on - the brief, its objective and the landing page as the plan read
 * it - for every copy card under an open ad, without passing it through each studio.
 */
const ClaimSourcesContext = React.createContext<readonly string[] | null>(null);

export function ClaimSourcesProvider({ sources, children }: { sources: readonly string[]; children: React.ReactNode }): React.ReactElement {
  return <ClaimSourcesContext.Provider value={sources}>{children}</ClaimSourcesContext.Provider>;
}

/** The sources, or null outside an open ad (no claim check then). */
export function useClaimSources(): readonly string[] | null {
  return React.useContext(ClaimSourcesContext);
}
