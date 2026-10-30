import { useTranslations } from 'next-intl';
import { PauseCircle, PlugZap, Wallet, type LucideIcon } from 'lucide-react';

const POINTS: { key: string; icon: LucideIcon }[] = [
  { key: 'paused', icon: PauseCircle },
  { key: 'budget', icon: Wallet },
  { key: 'connections', icon: PlugZap },
];

/** Why trying it is safe: nothing runs or spends without the person. */
export function HomeControl(): React.ReactElement {
  const t = useTranslations('HomePage');
  return (
    <section className="bg-pp-primary py-16 text-pp-on-primary" aria-labelledby="home-control-title">
      <div className="mx-auto flex max-w-6xl flex-col gap-8 px-4 sm:px-6">
        <h2 id="home-control-title" className="text-balance font-pp-display text-pp-headline-lg-mobile sm:text-pp-headline-lg">
          {t('controlTitle')}
        </h2>
        <ul className="grid gap-5 md:grid-cols-3">
          {POINTS.map(({ key, icon: Icon }) => (
            <li key={key} className="flex gap-3 rounded-3xl bg-white/10 p-5">
              <Icon className="mt-0.5 h-6 w-6 shrink-0" aria-hidden="true" />
              <div className="flex min-w-0 flex-col gap-1">
                <h3 className="text-pp-body-lg font-bold">{t(`control.${key}.title`)}</h3>
                <p className="text-pp-body-md opacity-90">{t(`control.${key}.body`)}</p>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
