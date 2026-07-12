'use client';

import { useTranslations } from 'next-intl';

export interface TvPairingScreenProps {
  code: string;
  statusLabel?: string;
}

/** The TV's own "waiting to be claimed" screen (KAN-67 AC: "device pairing code, no login on the TV itself") — huge, easy-to-read-from-across-the-room typography, dark theme (plan `10 §2.3`/`§4`). Purely presentational: `tv-app.tsx` owns minting the code and polling for a claim. */
export function TvPairingScreen({ code, statusLabel }: TvPairingScreenProps): React.ReactElement {
  const t = useTranslations('TvMode');

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-8 bg-background p-8 text-center">
      <h1 className="text-3xl font-semibold text-muted-foreground">{t('pairingHeading')}</h1>
      <p
        className="rounded-2xl border-4 border-primary px-12 py-6 text-8xl font-bold tracking-[0.3em]"
        aria-label={t('pairingCodeAriaLabel', { code })}
      >
        {code}
      </p>
      <p className="max-w-xl text-xl text-muted-foreground">{t('pairingInstructions')}</p>
      {statusLabel ? <p className="text-sm text-muted-foreground">{statusLabel}</p> : null}
    </main>
  );
}
