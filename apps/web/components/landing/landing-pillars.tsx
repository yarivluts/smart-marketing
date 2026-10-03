import { useTranslations } from 'next-intl';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Bot, Database, Megaphone, TrendingUp, CheckCircle } from 'lucide-react';

export function LandingPillars(): React.ReactElement {
  const t = useTranslations('HomePage');

  const pillars = [
    {
      icon: Database,
      badge: t('pillar1Badge'),
      title: t('pillar1Title'),
      description: t('pillar1Desc'),
      color: 'text-blue-500 bg-blue-500/10 border-blue-500/20',
      bullets: [
        t('pillar1Bullet1'),
        t('pillar1Bullet2'),
        t('pillar1Bullet3'),
      ],
    },
    {
      icon: TrendingUp,
      badge: t('pillar2Badge'),
      title: t('pillar2Title'),
      description: t('pillar2Desc'),
      color: 'text-emerald-500 bg-emerald-500/10 border-emerald-500/20',
      bullets: [
        t('pillar2Bullet1'),
        t('pillar2Bullet2'),
        t('pillar2Bullet3'),
      ],
    },
    {
      icon: Megaphone,
      badge: t('pillar3Badge'),
      title: t('pillar3Title'),
      description: t('pillar3Desc'),
      color: 'text-indigo-500 bg-indigo-500/10 border-indigo-500/20',
      bullets: [
        t('pillar3Bullet1'),
        t('pillar3Bullet2'),
        t('pillar3Bullet3'),
      ],
    },
    {
      icon: Bot,
      badge: t('pillar4Badge'),
      title: t('pillar4Title'),
      description: t('pillar4Desc'),
      color: 'text-purple-500 bg-purple-500/10 border-purple-500/20',
      bullets: [
        t('pillar4Bullet1'),
        t('pillar4Bullet2'),
        t('pillar4Bullet3'),
      ],
    },
  ];

  return (
    <section id="architecture" className="py-20 md:py-28">
      <div id="features" className="container mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col items-center text-center mb-16">
          <Badge variant="purple" size="sm" className="mb-3">
            {t('pillarsBadge')}
          </Badge>
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-foreground">
            {t('pillarsHeading')}
          </h2>
          <p className="mt-3 max-w-2xl text-muted-foreground text-base sm:text-lg">
            {t('pillarsSubheading')}
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {pillars.map((pillar, idx) => {
            const Icon = pillar.icon;
            return (
              <Card
                key={idx}
                hoverable
                className="flex flex-col justify-between p-8 rounded-2xl border border-border/80 bg-card/80 backdrop-blur-sm shadow-soft transition-all duration-200"
              >
                <div>
                  <div className="flex items-center justify-between mb-6">
                    <div className={`flex h-12 w-12 items-center justify-center rounded-2xl border ${pillar.color}`}>
                      <Icon className="h-6 w-6" />
                    </div>
                    <Badge variant="secondary" size="sm">
                      {pillar.badge}
                    </Badge>
                  </div>

                  <h3 className="text-xl font-bold text-foreground tracking-tight mb-3">
                    {pillar.title}
                  </h3>
                  <p className="text-muted-foreground leading-relaxed text-sm sm:text-base mb-6">
                    {pillar.description}
                  </p>
                </div>

                <div className="space-y-2.5 pt-4 border-t border-border/50">
                  {pillar.bullets.map((bullet, bIdx) => (
                    <div key={bIdx} className="flex items-center gap-2.5 text-xs sm:text-sm text-foreground/80">
                      <CheckCircle className="h-4 w-4 text-emerald-500 shrink-0" />
                      <span>{bullet}</span>
                    </div>
                  ))}
                </div>
              </Card>
            );
          })}
        </div>
      </div>
    </section>
  );
}
