import { Heebo, Plus_Jakarta_Sans } from 'next/font/google';
import '../../globals.css';
import { loadPublicLanding } from '@/lib/growth-pilot/public';

const sans = Plus_Jakarta_Sans({ subsets: ['latin'], variable: '--font-sans', display: 'swap' });
const hebrew = Heebo({ subsets: ['hebrew', 'latin'], variable: '--font-pp-hebrew', display: 'swap' });

type LayoutProps = Readonly<{ children: React.ReactNode; params: Promise<{ slug: string }> }>;

/**
 * The public landing pages' own document: outside the app's locale routing, with the page's own
 * language and direction - a visitor from an ad sees the business, not GrowthOS.
 */
export default async function LandingLayout({ children, params }: LayoutProps): Promise<React.ReactElement> {
  const { slug } = await params;
  const page = await loadPublicLanding(slug);
  return (
    <html lang={page?.language ?? 'en'} dir={page?.dir ?? 'ltr'} className={`${sans.variable} ${hebrew.variable}`}>
      <body className="min-h-screen bg-[#f7f5fd] antialiased" style={{ fontFamily: page?.dir === 'rtl' ? 'var(--font-pp-hebrew), sans-serif' : 'var(--font-sans), sans-serif' }}>
        {children}
      </body>
    </html>
  );
}
