import type { Metadata, Viewport } from 'next';
import './globals.css';
import Header from './components/header';
import PwaRegister from './components/pwa-register';

export const metadata: Metadata = {
  referrer: 'no-referrer',
  title: 'StandEL Time',
  description: 'StandEL AB • Work time management',
  applicationName: 'StandEL Time',
  manifest: '/manifest.webmanifest',
  appleWebApp: { capable: true, title: 'StandEL Time', statusBarStyle: 'default' },
  icons: { icon: [{ url: '/favicon-64.png', sizes: '64x64', type: 'image/png' }], apple: '/apple-touch-icon.png' },
};
export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: '#12283f' };

export default function Layout({children}:{children:React.ReactNode}) {
  return <html lang="ru"><body><PwaRegister/><Header/><main>{children}</main></body></html>;
}
