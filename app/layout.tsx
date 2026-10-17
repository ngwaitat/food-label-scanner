import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { DEFAULT_LOCALE, isLocale, LOCALE_COOKIE, type Locale } from './i18n';
import './globals.css';

export const metadata: Metadata = {
  title: '食品標籤掃描器',
  description: '掃描食品標籤，檢查產品是否為純素或蛋奶素。',
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies();
  const storedLocale = cookieStore.get(LOCALE_COOKIE)?.value;
  const locale: Locale = isLocale(storedLocale) ? storedLocale : DEFAULT_LOCALE;

  return (
    <html lang={locale}>
      <body className="min-h-screen bg-white text-gray-900">{children}</body>
    </html>
  );
}
