import type { Metadata, Viewport } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';

const publicBasePath = process.env.NEXT_PUBLIC_BASE_PATH ?? '';
const socialImage =
  'https://sergeisysoev.github.io/hvac-pro-calculator/og.png';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: 'Professional HVAC Calculator',
  description:
    'A professional full-screen HVAC field calculator with sheet-metal, trade geometry and ASHRAE equal-friction duct tools.',
  applicationName: 'Professional HVAC Calculator',
  manifest: `${publicBasePath}/manifest.webmanifest`,
  icons: {
    icon: `${publicBasePath}/icon.png`,
    apple: `${publicBasePath}/icon.png`,
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'HVAC Pro Calc',
  },
  openGraph: {
    title: 'Professional HVAC Calculator',
    description: 'Sheet-metal math, trade geometry and ASHRAE equal-friction duct sizing in your browser.',
    type: 'website',
    images: [{
      url: socialImage,
      width: 1736,
      height: 906,
      alt: 'Professional HVAC Calculator — Sheet Metal, Trade and Duct tools',
    }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Professional HVAC Calculator',
    description: 'Sheet-metal math, trade geometry and ASHRAE equal-friction duct sizing in your browser.',
    images: [socialImage],
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#101411',
  colorScheme: 'dark',
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
