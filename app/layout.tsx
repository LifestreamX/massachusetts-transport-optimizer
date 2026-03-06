import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import DarkModeToggle from '@/components/DarkModeToggle';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });

export const metadata: Metadata = {
  title: 'Boston Transit Optimizer',
  description:
    'Real-time MBTA route optimization — find the fastest, most reliable transit option in Boston.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang='en'>
      <body
        className={`${inter.variable} font-sans antialiased bg-gray-50 text-gray-900 relative`}
      >
        <div className="min-h-screen">
          <div className="fixed top-4 right-4 z-50">
            <DarkModeToggle />
          </div>
          {children}
        </div>
      </body>
    </html>
  );
}
