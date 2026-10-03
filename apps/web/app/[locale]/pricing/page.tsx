import { setRequestLocale } from 'next-intl/server';
import { PricingMtuCalculator } from '@/components/pricing/pricing-mtu-calculator';

type PageProps = Readonly<{
  params: Promise<{ locale: string }>;
}>;

export async function generateMetadata({ params: _params }: PageProps) {
  return {
    title: 'Pricing & MTU Calculator — GrowthOS',
    description: 'Transparent usage-based pricing for GrowthOS. Only pay for visitors in active experiments.',
  };
}

export default async function PricingPage({ params }: PageProps): Promise<React.ReactElement> {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <main className="container mx-auto px-4 py-8 max-w-7xl">
      <PricingMtuCalculator />
    </main>
  );
}
