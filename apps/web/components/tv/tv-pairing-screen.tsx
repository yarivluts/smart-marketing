'use client';

import { useTranslations } from 'next-intl';
import { Radar, Radio } from 'lucide-react';

export interface TvPairingScreenProps {
  code: string;
  statusLabel?: string;
}

/** The TV's own "waiting to be claimed" screen (KAN-67 AC: "device pairing code, no login on the TV itself") — huge, easy-to-read-from-across-the-room typography, dark theme (plan `10 §2.3`/`§4`). Purely presentational: `tv-app.tsx` owns minting the code and polling for a claim. */
export function TvPairingScreen({ code, statusLabel }: TvPairingScreenProps): React.ReactElement {
  const t = useTranslations('TvMode');

  return (
    <main className="flex min-h-screen flex-col items-center justify-between bg-pp-surface text-pp-on-surface p-8 lg:p-12 text-center font-pp-body select-none">
      {/* Billboard Top Bar */}
      <header className="flex items-center justify-between w-full max-w-5xl bg-pp-surface-container-lowest/90 backdrop-blur-md px-8 py-4 rounded-3xl shadow-pp-candy border border-pp-outline-variant/30">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-brand-gradient flex items-center justify-center text-white shadow-md">
            <Radar className="h-5 w-5" />
          </div>
          <div className="text-left rtl:text-right">
            <div className="flex items-center gap-2">
              <span className="font-pp-display font-extrabold text-xl tracking-tight text-pp-on-surface">GrowthOS</span>
              <span className="px-2.5 py-0.5 rounded-full bg-pp-surface-dim text-pp-on-surface font-mono text-[10px] font-bold uppercase tracking-wider">
                War-Room Live Billboard
              </span>
            </div>
            <p className="text-[10px] font-semibold text-pp-outline font-mono">HIGH-VELOCITY TELEMETRY • HUD /TV</p>
          </div>
        </div>

        <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-2xl bg-emerald-50 border border-emerald-200/80 text-emerald-800 text-xs font-mono font-bold">
          <span className="relative flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-500 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-600"></span>
          </span>
          <span>Ready for Pairing</span>
        </div>
      </header>

      {/* Main Pairing Code Section */}
      <div className="flex flex-col items-center justify-center gap-6 my-auto py-8">
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-pp-primary-container/15 text-pp-primary text-xs font-bold uppercase tracking-wider">
          <Radio className="h-3.5 w-3.5 animate-pulse" />
          Device Registration
        </div>
        <h1 className="text-3xl lg:text-4xl font-bold font-pp-display text-pp-on-surface">{t('pairingHeading')}</h1>
        <p
          className="rounded-3xl border-4 border-pp-primary bg-pp-surface-container-lowest shadow-pp-candy px-12 py-8 text-7xl lg:text-8xl font-black font-pp-display text-pp-primary tracking-[0.3em]"
          aria-label={t('pairingCodeAriaLabel', { code })}
        >
          {code}
        </p>
        <p className="max-w-xl text-lg lg:text-xl text-pp-on-surface-variant font-medium leading-relaxed">
          {t('pairingInstructions')}
        </p>
        {statusLabel ? (
          <p className="text-sm font-semibold text-pp-outline font-mono bg-pp-surface-container-low px-4 py-1.5 rounded-full">
            {statusLabel}
          </p>
        ) : null}
      </div>

      {/* Footer Billboard Note */}
      <footer className="text-xs text-pp-outline font-mono">
        SCREEN PAIRING HUD • ZERO-TOUCH KIOSK MODE
      </footer>
    </main>
  );
}
