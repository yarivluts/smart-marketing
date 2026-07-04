import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'GrowthOS',
  description: 'Multi-vertical growth analytics platform',
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>): React.ReactElement {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
