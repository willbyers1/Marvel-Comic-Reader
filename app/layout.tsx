import type {Metadata, Viewport} from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Marvel Comics | Personal Superhero Vault',
  description: 'An online comic book reader platform with a Marvel superhero theme supporting CBZ, CBR, CB7, CBT, and CBA archives.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
};

export default function RootLayout({children}: {children: React.ReactNode}) {
  return (
    <html lang="en" className="dark">
      <body suppressHydrationWarning className="bg-[#0c0c12] text-gray-100 min-h-screen antialiased selection:bg-[#ed1d24] selection:text-white">
        {children}
      </body>
    </html>
  );
}
