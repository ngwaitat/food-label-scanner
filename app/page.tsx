import { cookies } from 'next/headers';
import Scanner from './Scanner';
import { DEFAULT_LOCALE, isLocale, LOCALE_COOKIE, type Locale } from './i18n';

export default async function Page() {
  const cookieStore = await cookies();
  const storedLocale = cookieStore.get(LOCALE_COOKIE)?.value;
  const initialLocale: Locale = isLocale(storedLocale) ? storedLocale : DEFAULT_LOCALE;

  return <Scanner initialLocale={initialLocale} />;
}
