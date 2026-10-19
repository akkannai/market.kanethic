import type { Metadata, Viewport } from 'next';
import './globals.css';
import { AppProviders } from '@/components/providers';
import { Shell } from '@/components/shell';

export const metadata: Metadata = {
  title: { default: 'Kanethic Market Hub', template: '%s | Kanethic Market Hub' },
  description: 'Near-live Indian and global markets, currencies, commodities, news and economic calendar. Kanethic Private Limited — Invest With Discipline.',
  icons: { icon: '/favicon.svg' },
};

export const viewport: Viewport = { themeColor: '#0a1830', width: 'device-width', initialScale: 1 };

// Paint pahela theme set kare (flash vagar).
const themeScript = `try{var t=localStorage.getItem('kmh-theme')||(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light');document.documentElement.dataset.theme=t}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{ __html: themeScript }} /></head>
      <body>
        <AppProviders>
          <Shell>{children}</Shell>
        </AppProviders>
      </body>
    </html>
  );
}
