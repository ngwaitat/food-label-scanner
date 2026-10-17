import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Food Label Scanner',
  description: 'Scan a food label to check if it is vegan or vegetarian.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-white text-gray-900">{children}</body>
    </html>
  );
}
