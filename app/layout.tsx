import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: '食品標籤掃描器',
  description: '掃描食品標籤，檢查產品是否為純素或蛋奶素。',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-Hant">
      <body className="min-h-screen bg-white text-gray-900">{children}</body>
    </html>
  );
}
