import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';

const socialImage =
  'https://raw.githubusercontent.com/SergeiSysoev/hvac-pro-calc-4090/main/public/og.png';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: 'HVAC 4090 Pro — Web Field Calculator',
  description:
    'An independent 4090-compatible calculator for sheet metal, HVAC, dimensional math, fan laws and field geometry.',
  applicationName: 'HVAC 4090 Pro',
  manifest: '/manifest.webmanifest',
  icons: { icon: '/og.png', apple: '/og.png' },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'HVAC 4090',
  },
  openGraph: {
    title: 'HVAC 4090 Pro — Web Field Calculator',
    description: 'Sheet metal math, fan laws, field geometry and dimensional conversions in your browser.',
    type: 'website',
    images: [{
      url: socialImage,
      width: 1734,
      height: 907,
      alt: 'HVAC 4090 Pro Web Field Calculator',
    }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'HVAC 4090 Pro — Web Field Calculator',
    description: 'Sheet metal math, fan laws, field geometry and dimensional conversions in your browser.',
    images: [socialImage],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
